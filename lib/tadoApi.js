const https = require('https');
const axios = require('axios');

const TADO_URL = 'https://my.tado.com';
const TADO_APP_URL = `https://app.tado.com/`;
const TADO_TIMEOUT = 15000;
const THRESHOLD_LIMITRENEW = 10;

// @ts-expect-error create axios instance
let axiosInstance = axios.create({
    timeout: TADO_TIMEOUT,
    baseURL: `${TADO_URL}/`,
    httpsAgent: new https.Agent({ keepAlive: true }),
    referer: TADO_APP_URL,
    origin: TADO_APP_URL,
});

/**
 *Handles Tado API interactions with rate limiting for non-GET requests.
 */
class TadoApi {
    /**
     * Creates an instance of the Tado API handler.
     *
     * @param {object} adapter - The adapter object containing configuration and state.
     * @param {number} [waitingTime] - The minimum waiting time (in ms) between non-GET API calls.
     */
    constructor(adapter, waitingTime = 300) {
        this.adapter = adapter;
        this.axiosInstance = axiosInstance;
        this.waitingTime = waitingTime;
        this.queue = []; // FIFO queue for non-GET calls
        this.processing = false; // worker state
        this.lastCallTime = 0; // last non-GET call timestamp
        this.firstRun = true;
        this.callsLeftLastRun = 99999999;
    }

    /**
     * Executes an API call to the specified URL with the given method and payload.
     *
     * @param {string} url
     * @param {string} method
     * @param {any} payload
     * @param {string} caller
     */
    async apiCall(url, method = 'get', payload = {}, caller = '') {
        const stack = new Error().stack;
        if (stack && !caller) {
            let stackParts = stack.split(' at ');
            const regex = /Tado\.\s*(\S+)/;
            const match = stackParts[2].match(regex);
            if (match) {
                caller = match[1];
            }
        }
        method = method.toLowerCase();
        if (method === 'get') {
            // GET requests run in parallel
            return this._doApiCall(url, method, payload, caller);
        }

        // Non-GET requests go into queue
        return new Promise((resolve, reject) => {
            this.queue.push({ url, method, payload, caller, resolve, reject });
            this._processQueue(); // trigger worker
        });
    }

    /**
     * Handler to process the queue of non-GET requests.
     */
    async _processQueue() {
        if (this.processing) {
            return;
        } // worker already active
        this.processing = true;

        while (this.queue.length > 0) {
            const { url, method, payload, caller, resolve, reject } = this.queue.shift();

            try {
                // enforce delay between non-GET calls
                const now = Date.now();
                const elapsed = now - this.lastCallTime;
                if (elapsed < this.waitingTime) {
                    await this.adapter.sleep(this.waitingTime - elapsed);
                }

                const result = await this._doApiCall(url, method, payload, caller);
                this.adapter.debugLog(`apiCall(${caller}) successful.`);
                this.lastCallTime = Date.now(); // update timestamp
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }

        this.processing = false;
    }

    /**
     * Handles the actual API call using axios.
     *
     * @param {string} url
     * @param {string }method
     * @param {any} payload
     * @param {string} caller
     */
    async _doApiCall(url, method, payload, caller = '') {
        const maxRetries = 3; //3
        const retryDelay = 5000; // 5 seconds

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (!this.adapter.accessToken) {
                    throw new Error('Not yet logged in');
                }

                await this.adapter.refreshToken();

                this.adapter.debugLog(`TadoX ${this.adapter.isTadoX} | method ${method} | URL ${url} | body "${JSON.stringify(payload)}"`);
                const response = await this.axiosInstance({
                    url,
                    method,
                    data: payload,
                    headers: {
                        Authorization: `Bearer ${this.adapter.accessToken.token.access_token}`,
                        Source: `iobroker.tado@${this.adapter.version}`,
                    },
                });

                const ratelimit = response.headers['ratelimit'] ?? '';
                const ratelimitPolicy = response.headers['ratelimit-policy'] ?? '';
                let callsLeft = ratelimit != null ? ratelimit.match(/r=(\d+)/) : undefined; //get r=value from the header
                let callsQuota = ratelimitPolicy != null ? ratelimitPolicy.match(/q=(\d+)/) : undefined; //get q=value from the header
                this.adapter.debugLog(`RateLimit: ${ratelimit}`);
                this.adapter.debugLog(`RateLimitPolicy: ${ratelimitPolicy}`);

                callsLeft = parseInt(callsLeft?.[1]) ?? undefined;
                callsQuota = parseInt(callsQuota?.[1]) ?? undefined;
                if (callsLeft !== undefined && callsQuota !== undefined) {
                    this._updateCallStats(url, callsLeft, callsQuota);
                }
                return response.data;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes('timeout of') && errorMessage.includes('ms exceeded') && attempt < maxRetries) {
                    if (attempt > maxRetries - 2) {
                        const info = `apiCall(${caller}) timed out (${TADO_TIMEOUT}ms). Retrying in ${retryDelay / 1000} seconds... (Attempt ${attempt + 1}/${maxRetries})`;
                        this.adapter.log.warn(info);
                        console.log(info);
                    } else {
                        const info = `apiCall(${caller}) timed out (${TADO_TIMEOUT}ms). Retrying in ${retryDelay / 1000} seconds... (Attempt ${attempt + 1}/${maxRetries})`;
                        this.adapter.log.info(info);
                        console.log(info);
                    }
                    await this.adapter.sleep(retryDelay);
                    continue;
                }

                // @ts-expect-error error.respone exists
                if (error?.response?.data && error?.message) {
                    // @ts-expect-error error.message exists
                    console.error(`${error.message} with response ${JSON.stringify(error.response.data)}`);
                    // @ts-expect-error error.message and error.response exists
                    this.adapter.log.error(`${error.message} with response ${JSON.stringify(error.response.data)}`);
                } else {
                    console.error(error);
                    this.adapter.log.error(error);
                }

                if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
                    error.message = `apiCall(${caller}) failed: ${error.message}`;
                }
                throw error;
            }
        }
    }

    /**
     *
     * @param {string} url
     * @param {number} callsLeft
     * @param {number} callsQuota
     */
    _updateCallStats(url, callsLeft, callsQuota) {
        if (typeof this.adapter.numberOfCalls === 'undefined') {
            return;
        }

        if (this.callsLeftLastRun + THRESHOLD_LIMITRENEW < callsLeft) {
            this.adapter.log.info(
                `Tado API quota was renewed when ${this.callsLeftLastRun} calls were left. For the next 24 hours a quota of ${callsLeft + 1} calls is available.`,
            );
        }
        this.callsLeftLastRun = callsLeft;

        if (this.firstRun) {
            this.adapter.log.info(`Tado allows ${callsQuota} calls per day for your account | ${callsLeft} calls left`);
            if (callsQuota < 1000) {
                this.adapter.log.warn(`You have a very low number of API calls per day. This may lead to '429' issues`);
            }
            this.firstRun = false;
        }
        const rateLimitInfo = `Ratelimit info: ${callsLeft} calls out of ${callsQuota} still available.`;

        if (this.adapter.numberOfCalls.day === new Date().getDate()) {
            this.adapter.numberOfCalls.calls++;
        } else {
            this.adapter.log.info(`${this.adapter.numberOfCalls.calls} API calls at the end of yesterday  |  ${rateLimitInfo}`);
            this.adapter.numberOfCalls.calls = 1;
            this.adapter.numberOfCalls.day = new Date().getDate();
        }

        if (this.adapter.numberOfCalls.calls % 20 === 0 && this.adapter.logCalls) {
            this.adapter.log.info(`${this.adapter.numberOfCalls.calls} API calls since last midnight (or restart)  |  ${rateLimitInfo}`);
        }
        if (this.adapter.logCallsDetail) {
            this.adapter.log.info(`${this.adapter.numberOfCalls.calls} API calls since last midnight (or restart)  [${url}]`);
            this.adapter.log.info(rateLimitInfo);
        }
    }
}

module.exports = TadoApi;
