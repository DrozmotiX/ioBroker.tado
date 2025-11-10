'use strict';

const utils = require('@iobroker/adapter-core');
const TadoApi = require('./lib/tadoApi.js');
const jsonExplorer = require('iobroker-jsonexplorer');
const state_attr = require(`${__dirname}/lib/state_attr.js`); // Load attribute library
const isOnline = require('@esm2cjs/is-online').default;
const axios = require('axios');
const { version } = require('./package.json');
const debounce = require('lodash.debounce');

const TOKEN_EXPIRATION_WINDOW = 10;
const TOKEN_API_TIMEOUT = 10000; //10s
const TOKEN_BASE_URL = `https://login.tado.com/oauth2`;
const TADO_X_URL = `https://hops.tado.com`;
const CLIENT_ID = `1bb50063-6b0c-4d11-bd99-387f4a91cc46`;
const DEBOUNCE_TIME = 750; //750ms debouncing (waiting if further calls come in and just execute the last one)
const DELAY_AFTER_CALL = 300; //300ms pause between api calls

// @ts-expect-error create axios instance
const axiosInstanceToken = axios.create({
    timeout: TOKEN_API_TIMEOUT,
    baseURL: TOKEN_BASE_URL,
});

let polling; // Polling timer
let pooltimer = [];
let outdated = {
    //${homeId}.Mobile_Devices
    manageMobileDevices: {
        isOutdated: false,
        lastUpdate: 0,
        intervall: 60,
    },
    //${homeId}.Weather
    manageWeather: {
        isOutdated: false,
        lastUpdate: 0,
        intervall: 10,
    },
    //${homeId}.Rooms
    manageZones: {
        isOutdated: false,
        lastUpdate: 0,
        intervall: 60,
    },
    //${homeId}.Rooms.${zoneId}.devices.${deviceId}.offset
    manageTemperatureOffset: {
        isOutdated: false,
        lastUpdate: 0,
        intervall: 60 * 24,
    },
    //${homeId}.Rooms.${zoneId}.timeTables
    manageTimeTables: {
        isOutdated: false,
        lastUpdate: 0,
        intervall: 60 * 24,
    },
    //${homeId}.Rooms.${zoneId}.awayConfig
    manageAwayConfiguration: {
        isOutdated: false,
        lastUpdate: 0,
        intervall: 60 * 24,
    },
    //${homeId}.Home.state
    manageHomeState: {
        isOutdated: false,
        lastUpdate: 60,
    },
};

for (let key in outdated) {
    outdated[key].intervall = outdated[key].intervall * 60 * 1000;
}

class Tado extends utils.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options]
     */
    constructor(options) {
        // @ts-expect-error Call super constructor
        super({
            ...options,
            name: 'tado',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.on('message', this.onMessage.bind(this));
        jsonExplorer.init(this, state_attr);
        this.lastupdate = 0;
        this.retryCount = 0;
        this.apiCallinExecution = false;
        this.intervall_time = 60 * 1000;
        this.oldStatesVal = [];
        this.isTadoX = false;
        this.numberOfCalls = { day: new Date().getDate(), calls: 0 };
        //data objects
        this.getMeData = null;
        this.homeData = null;
        this.zonesData = {};
        this.timeTablesData = {};
        this.awayConfigurationData = {};
        this.roomCapabilities = {};
        //token
        this.device_code = '';
        this.uri4token = '';
        this.accessToken = {};
        this.refreshTokenInProgress = false;
        this.shouldRefreshToken = false;

        this.api = new TadoApi(this, DELAY_AFTER_CALL); //pause between calls
        this.debouncedSetZoneOverlay = debounce(
            (homeId, zoneId, config, resolve, reject) => {
                this._setZoneOverlay(homeId, zoneId, config).then(resolve).catch(reject);
            },
            DEBOUNCE_TIME, // debouncing (waiting if further calls come in and just execute the last one)
        );
        this.debouncedSetManualControlTadoX = debounce(
            (homeId, roomId, power, temperature, terminationMode, boostMode, durationInSeconds, resolve, reject) => {
                this._setManualControlTadoX(homeId, roomId, power, temperature, terminationMode, boostMode, durationInSeconds)
                    .then(resolve)
                    .catch(reject);
            },
            DEBOUNCE_TIME,
        );
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        jsonExplorer.sendVersionInfo(version);
        this.log.info(`Started with JSON-Explorer version ${jsonExplorer.version}`);

        //read config
        this.intervall_time = Math.max(30, this.config.intervall) * 1000;
        this.logCalls = this.config.logCalls || false;
        this.logCallsDetail = this.config.logCallsDetail || false;
        this.intervall_time = Math.max(60, this.config.standard || 60) * 1000;
        outdated.manageMobileDevices.intervall = (this.config.mobildevices || 0) * 60 * 1000;
        outdated.manageWeather.intervall = (this.config.weather || 0) * 60 * 1000;
        outdated.manageZones.intervall = (this.config.zones || 0) * 60 * 1000;
        outdated.manageTemperatureOffset.intervall = (this.config.temperatureOffset || 0) * 60 * 1000;
        outdated.manageHomeState.intervall = (this.config.homeState || 0) * 60 * 1000;
        outdated.manageAwayConfiguration.intervall = (this.config.awayConfiguration || 0) * 60 * 1000;
        outdated.manageTimeTables.intervall = (this.config.timeTables || 0) * 60 * 1000;

        for (let key in outdated) {
            if (outdated[key].intervall === 0) {
                outdated[key].intervall = 999999999999999;
            }
            this.debugLog(`${key}: ${outdated[key].intervall}`);
        }

        const tokenObject = await this.getObjectAsync('_config');
        this.debugLog(`T-Object from config is${JSON.stringify(tokenObject)}`);
        this.accessToken = tokenObject && tokenObject.native && tokenObject.native.tokenSet ? tokenObject.native.tokenSet : null;
        this.debugLog(`accessT is ${JSON.stringify(this.accessToken)}`);
        if (this.accessToken == null) {
            this.accessToken = {};
            this.accessToken.token = {};
            this.accessToken.token.refresh_token = '';
        }
        await jsonExplorer.stateSetCreate('info.connection', 'connection', false);
        await this.connect();
    }

    async onMessage(msg) {
        try {
            if (typeof msg === 'object' && msg.command) {
                switch (msg.command) {
                    case 'auth1': {
                        this.debugLog(`Received t_o_k_e_n creation Step 1 message`);
                        axiosInstanceToken
                            .post(`/device_authorize?client_id=${CLIENT_ID}&scope=offline_access`, {})
                            .then(responseRaw => {
                                let response = responseRaw.data;
                                this.log.debug(`Response t_o_k_e_n Step 1 is ${JSON.stringify(response)}`);
                                this.device_code = response.device_code;
                                this.uri4token = response.verification_uri_complete;
                                msg.callback &&
                                    this.sendTo(
                                        msg.from,
                                        msg.command,
                                        { error: `Copy address in your browser and proceed ${this.uri4token}` },
                                        msg.callback,
                                    );
                                this.log.info(`Copy address in your browser and proceed ${this.uri4token}`);
                                this.debugLog('t_o_k_e_n Step 1 done');
                            })
                            .catch(error => {
                                this.log.error(`Error at token creation Step 1 ${error}`);
                                console.error(`Error at t_o_k_e_n creation Step 1 ${error}`);
                                if (error?.response?.data) {
                                    console.error(`${error} with response ${JSON.stringify(error.response.data)}`);
                                    this.log.error(`${error} with response ${JSON.stringify(error.response.data)}`);
                                }
                                if (error.message) {
                                    error.message = `CreateT Step1 failed: ${error.message}`;
                                }
                                this.errorHandling(error);
                            });
                        break;
                    }
                    case 'auth2': {
                        this.debugLog(`Received t_o_k_e_n step 2 message`);
                        if (!this.device_code) {
                            this.log.error('Step 1 was not executed, but step 2 startet! Please start/restart with Step 1.');
                            break;
                        }
                        const uri = `/token?client_id=${CLIENT_ID}&device_code=${this.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`;
                        this.debugLog(`t_o_k_e_n Step 2 Url is ${uri}`);
                        axiosInstanceToken
                            .post(uri, {})
                            .then(async responseRaw => {
                                this.debugLog(`Response t_o_k_e_n Step 2 is ${JSON.stringify(responseRaw.data)}`);
                                await this.manageNewToken(responseRaw.data);
                                msg.callback && this.sendTo(msg.from, msg.command, { error: `Done! Adapter starts now...` }, msg.callback);
                                this.log.info(`Token process done! Adapter starts now...`);
                                this.debugLog('t_o_k_e_n Step 2 done');
                                await this.connect();
                            })
                            .catch(error => {
                                this.log.error(`Error at token creation Step 2 ${error}`);
                                console.error(`Error at t_o_k_e_n creation Step 2 ${error}`);
                                if (error?.response?.data) {
                                    let message = JSON.stringify(error.response.data);
                                    if (message.includes('authorization_pending')) {
                                        this.log.error(
                                            `Step 1 not completed. Open link '${this.uri4token}' in your browser and follow described steps on webpage`,
                                        );
                                        return;
                                    }
                                    console.error(`${error} with response ${JSON.stringify(error.response.data)}`);
                                    this.log.error(`${error} with response ${JSON.stringify(error.response.data)}`);
                                }
                                if (error.message) {
                                    error.message = `CreateT Step2 failed: ${error.message}`;
                                }
                                this.errorHandling(error);
                            });
                        break;
                    }
                }
            }
        } catch (error) {
            this.log.error(`Issue at token process: ${error}`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            //this.resetTimer();
            this.log.info('cleaned everything up...');
            callback();
        } catch {
            callback();
        }
    }

    //////////////////////////////////////////////////////////////////////
    /* ON STATE CHANGE													*/
    //////////////////////////////////////////////////////////////////////

    /**
     * @param {string} id
     * @param {ioBroker.State} state
     * @param {string} homeId
     * @param {string} roomId
     * @param {string} deviceId
     * @param {string} statename
     * @param {string} beforeStatename
     */
    async onStateChangeTadoX(id, state, homeId, roomId, deviceId, statename, beforeStatename) {
        try {
            this.debugLog(`${id} changed`);
            const [temperature, mode, power, remainingTimeInSeconds, nextTimeBlockStart, boostMode] = await Promise.all([
                this.getStateAsync(`${homeId}.Rooms.${roomId}.setting.temperature.value`),
                this.getStateAsync(`${homeId}.Rooms.${roomId}.manualControlTermination.controlType`),
                this.getStateAsync(`${homeId}.Rooms.${roomId}.setting.power`),
                this.getStateAsync(`${homeId}.Rooms.${roomId}.manualControlTermination.remainingTimeInSeconds`),
                this.getStateAsync(`${homeId}.Rooms.${roomId}.nextTimeBlock.start`),
                this.getStateAsync(`${homeId}.Rooms.${roomId}.boostMode`),
            ]);

            const set_boostMode = getStateValue(boostMode, false, toBoolean);
            const set_remainingTimeInSeconds = getStateValue(remainingTimeInSeconds, 1800, val => parseInt(val.toString()));
            const set_temp = getStateValue(temperature, 20, val => parseFloat(val.toString()));
            const set_NextTimeBlockStartExists = getStateValue(nextTimeBlockStart, false, () => true); //return always true if exists
            let set_power = getStateValue(power, 'OFF', val => val.toString().toUpperCase());
            let set_terminationMode = getStateValue(mode, 'NO_OVERLAY', val => val.toString().toUpperCase());
            let offSet, deviceID;

            this.debugLog(`boostMode is: ${set_boostMode}`);
            this.debugLog(`Power is: ${set_power}`);
            this.debugLog(`Temperature is: ${set_temp}`);
            this.debugLog(`Termination mode is: ${set_terminationMode}`);
            this.debugLog(`RemainingTimeInSeconds is: ${set_remainingTimeInSeconds}`);
            this.debugLog(`NextTimeBlockStart exists: ${set_NextTimeBlockStartExists}`);
            this.debugLog(`DevicId is: ${deviceId}`);

            switch (statename) {
                case 'power':
                    if (set_terminationMode == 'NO_OVERLAY') {
                        if (set_power == 'ON') {
                            this.debugLog(`Overlay cleared for room '${roomId}' in home '${homeId}'`);
                            await this.setResumeRoomScheduleTadoX(homeId, roomId);
                            break;
                        } else {
                            set_terminationMode = 'MANUAL';
                        }
                    }

                    await this.setManualControlTadoX(
                        homeId,
                        roomId,
                        set_power,
                        set_temp,
                        set_terminationMode,
                        set_boostMode,
                        set_remainingTimeInSeconds,
                    );
                    if (set_power == 'OFF') {
                        jsonExplorer.stateSetCreate(`${homeId}.Rooms.${roomId}.setting.temperature.value`, 'value', null);
                    }
                    break;

                case 'value':
                    if (beforeStatename != 'temperature') {
                        this.log.warn(`Change of ${id} ignored`);
                        break;
                    }

                    if (set_terminationMode == 'NO_OVERLAY') {
                        if (set_NextTimeBlockStartExists) {
                            set_terminationMode = 'NEXT_TIME_BLOCK';
                        } else {
                            set_terminationMode = 'MANUAL';
                        }
                    }
                    set_power = 'ON';
                    await this.setManualControlTadoX(
                        homeId,
                        roomId,
                        set_power,
                        set_temp,
                        set_terminationMode,
                        set_boostMode,
                        set_remainingTimeInSeconds,
                    );
                    break;

                case 'boost':
                    if (state.val == true) {
                        await this.setBoostTadoX(homeId);
                        await jsonExplorer.sleep(1000);
                        this.create_state(id, 'boost', false);
                    }
                    break;

                case 'resumeScheduleHome':
                    if (state.val == true) {
                        await this.setResumeHomeScheduleTadoX(homeId);
                        await jsonExplorer.sleep(1000);
                        this.create_state(id, 'resumeScheduleHome', false);
                    }
                    break;

                case 'resumeScheduleRoom':
                    if (state.val == true) {
                        await this.setResumeRoomScheduleTadoX(homeId, roomId);
                        await jsonExplorer.sleep(1000);
                        this.create_state(id, 'resumeScheduleRoom', false);
                    }
                    break;

                case 'allOff':
                    if (state.val == true) {
                        await this.setAllOffTadoX(homeId);
                        await jsonExplorer.sleep(1000);
                        this.create_state(id, 'allOff', false);
                    }
                    break;

                case 'remainingTimeInSeconds':
                    set_terminationMode = 'TIMER';
                    await this.setManualControlTadoX(
                        homeId,
                        roomId,
                        set_power,
                        set_temp,
                        set_terminationMode,
                        set_boostMode,
                        set_remainingTimeInSeconds,
                    );
                    break;

                case 'controlType':
                    if (beforeStatename != 'manualControlTermination') {
                        this.log.warn(`Change of ${id} ignored`);
                        break;
                    }
                    await this.setManualControlTadoX(
                        homeId,
                        roomId,
                        set_power,
                        set_temp,
                        set_terminationMode,
                        set_boostMode,
                        set_remainingTimeInSeconds,
                    );
                    break;
                case 'temperatureOffset':
                    if (state.val == null) {
                        this.log.warn('No valid value for offset found, ignored!');
                        break;
                    }
                    offSet = parseFloat(String(state.val));
                    deviceID = beforeStatename;
                    this.debugLog(`Offset new is ${offSet}`);
                    this.debugLog(`DeviceId is ${deviceID}`);
                    this.setOffSetTadoX(homeId, deviceID, offSet);
                    break;
            }
        } catch (error) {
            this.log.error(`Issue at state change (TadoX): ${error}`);
            console.error(`Issue at state change (TadoX): ${error}`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        if (state) {
            // The state was changed
            if (state.ack === false) {
                if (this.oldStatesVal[id] === state.val) {
                    this.debugLog(`State ${id} did not change, value is ${state.val}. No further actions!`);
                    return;
                }
                try {
                    this.debugLog('GETS INTERESSTING!!!');
                    const idSplitted = id.split('.');
                    const homeId = idSplitted[2];
                    const zoneId = idSplitted[4];
                    const deviceId = idSplitted[6];
                    const statename = idSplitted[idSplitted.length - 1];
                    const beforeStatename = idSplitted[idSplitted.length - 2];
                    this.debugLog(`Attribute '${id}' changed. '${statename}' will be checked.`);

                    if (statename != 'meterReadings' && statename != 'presence') {
                        if (this.isTadoX) {
                            await this.onStateChangeTadoX(id, state, homeId, zoneId, deviceId, statename, beforeStatename);
                            return;
                        }
                    }

                    if (statename == 'meterReadings') {
                        let meterReadings = {};
                        try {
                            meterReadings = JSON.parse(String(state.val));
                        } catch (error) {
                            this.log.error(`'${state.val}' is not a valide JSON for meterReadings - ${error}`);
                            return;
                        }
                        if (meterReadings.date && meterReadings.reading) {
                            let date = String(meterReadings.date);
                            if (typeof meterReadings.reading != 'number') {
                                this.log.error('meterReadings.reading is not a number!');
                                return;
                            }
                            let regEx = /^\d{4}-\d{2}-\d{2}$/;
                            if (!date.match(regEx)) {
                                this.log.error('meterReadings.date has other format than YYYY-MM-DD');
                                return;
                            }
                            await this.setReading(homeId, meterReadings);
                        } else {
                            this.log.error('meterReadings does not contain date and reading');
                            return;
                        }
                    } else if (statename == 'offsetCelsius') {
                        let set_offset = getStateValue(state, 0, parseFloat);
                        this.debugLog(`Offset changed for device '${deviceId}' in home '${homeId}' to value '${set_offset}'`);
                        this.setTemperatureOffset(homeId, zoneId, deviceId, set_offset);
                    } else if (statename == 'childLockEnabled') {
                        let set_childLockEnabled = getStateValue(state, false, toBoolean);
                        this.debugLog(`ChildLockEnabled changed for device '${deviceId}' in home '${homeId}' to value '${set_childLockEnabled}'`);
                        this.setChildLock(homeId, zoneId, deviceId, set_childLockEnabled);
                    } else if (statename == 'tt_id') {
                        let set_tt_id = getStateValue(state, 0, parseInt);
                        this.debugLog(`TimeTable changed for room '${zoneId}' in home '${homeId}' to value '${set_tt_id}'`);
                        this.setActiveTimeTable(homeId, zoneId, set_tt_id);
                    } else if (statename == 'presence') {
                        let set_presence = getStateValue(state, 'HOME', val => val.toString().toUpperCase());
                        this.debugLog(`Presence changed in home '${homeId}' to value '${set_presence}'`);
                        this.setPresenceLock(homeId, set_presence);
                    } else if (statename == 'masterswitch') {
                        let set_masterswitch = getStateValue(state, 'unknown', val => val.toString().toUpperCase());
                        this.debugLog(`Masterswitch changed in home '${homeId}' to value '${set_masterswitch}'`);
                        await this.setMasterSwitch(set_masterswitch);
                        await this.sleep(1000);
                        await this.setState(`${homeId}.Home.masterswitch`, '', true);
                    } else if (statename == 'activateOpenWindow') {
                        this.debugLog(`Activate Open Window for room '${zoneId}' in home '${homeId}'`);
                        await this.setActivateOpenWindow(homeId, zoneId);
                    } else if (
                        idSplitted[idSplitted.length - 2] === 'openWindowDetection' &&
                        (statename == 'openWindowDetectionEnabled' || statename == 'timeoutInSeconds')
                    ) {
                        const openWindowDetectionEnabled = await this.getStateAsync(
                            `${homeId}.Rooms.${zoneId}.openWindowDetection.openWindowDetectionEnabled`,
                        );
                        const openWindowDetectionTimeoutInSeconds = await this.getStateAsync(
                            `${homeId}.Rooms.${zoneId}.openWindowDetection.timeoutInSeconds`,
                        );
                        let set_openWindowDetectionEnabled = getStateValue(openWindowDetectionEnabled, false, toBoolean);
                        let set_openWindowDetectionTimeoutInSeconds = getStateValue(openWindowDetectionTimeoutInSeconds, 900, Number);

                        this.debugLog(`Open Window Detection enabled: ${set_openWindowDetectionEnabled}`);
                        this.debugLog(`Open Window Detection Timeout is: ${set_openWindowDetectionTimeoutInSeconds}`);

                        this.debugLog(`Changing open window detection for '${zoneId}' in home '${homeId}'`);
                        await this.setOpenWindowDetectionSettings(homeId, zoneId, {
                            enabled: set_openWindowDetectionEnabled,
                            timeoutInSeconds: set_openWindowDetectionTimeoutInSeconds,
                        });
                    } else {
                        const [type, temperature, mode, power, durationInSeconds, nextTimeBlockStart] = await Promise.all([
                            this.getStateAsync(`${homeId}.Rooms.${zoneId}.setting.type`),
                            this.getStateAsync(`${homeId}.Rooms.${zoneId}.setting.temperature.celsius`),
                            this.getStateAsync(`${homeId}.Rooms.${zoneId}.overlay.termination.typeSkillBasedApp`),
                            this.getStateAsync(`${homeId}.Rooms.${zoneId}.setting.power`),
                            this.getStateAsync(`${homeId}.Rooms.${zoneId}.overlay.termination.durationInSeconds`),
                            this.getStateAsync(`${homeId}.Rooms.${zoneId}.nextTimeBlock.start`),
                        ]);

                        let acMode, fanLevel, horizontalSwing, verticalSwing, fanSpeed, swing, light;

                        const set_type = getStateValue(type, 'HEATING', val => val.toString().toUpperCase());
                        const set_durationInSeconds = getStateValue(durationInSeconds, 1800, parseInt);
                        let set_temp = getStateValue(temperature, 20, val => parseFloat(val.toString()));
                        let set_power = getStateValue(power, 'OFF', val => val.toString().toUpperCase());
                        let set_mode = getStateValue(mode, 'NO_OVERLAY', val => val.toString().toUpperCase());
                        const set_NextTimeBlockStartExists = getStateValue(nextTimeBlockStart, false, () => true); //return always true if exists

                        if (set_type == 'AIR_CONDITIONING') {
                            [acMode, fanSpeed, fanLevel, horizontalSwing, verticalSwing, swing, light] = await Promise.all([
                                this.getStateAsync(`${homeId}.Rooms.${zoneId}.setting.mode`),
                                this.getStateAsync(`${homeId}.Rooms.${zoneId}.setting.fanSpeed`),
                                this.getStateAsync(`${homeId}.Rooms.${zoneId}.setting.fanLevel`),
                                this.getStateAsync(`${homeId}.Rooms.${zoneId}.setting.horizontalSwing`),
                                this.getStateAsync(`${homeId}.Rooms.${zoneId}.setting.verticalSwing`),
                                this.getStateAsync(`${homeId}.Rooms.${zoneId}.setting.swing`),
                                this.getStateAsync(`${homeId}.Rooms.${zoneId}.setting.light`),
                            ]);
                        }
                        const set_acMode =
                            acMode === undefined ? 'NOT_AVAILABLE' : getStateValue(acMode, 'COOL', val => val.toString().toUpperCase());
                        const set_fanSpeed =
                            fanSpeed === undefined ? 'NOT_AVAILABLE' : getStateValue(fanSpeed, 'AUTO', val => val.toString().toUpperCase());
                        const set_fanLevel =
                            fanLevel === undefined ? 'NOT_AVAILABLE' : getStateValue(fanLevel, 'AUTO', val => val.toString().toUpperCase());
                        const set_horizontalSwing =
                            horizontalSwing === undefined
                                ? 'NOT_AVAILABLE'
                                : getStateValue(horizontalSwing, 'OFF', val => val.toString().toUpperCase());
                        const set_verticalSwing =
                            verticalSwing === undefined ? 'NOT_AVAILABLE' : getStateValue(verticalSwing, 'OFF', val => val.toString().toUpperCase());
                        const set_swing = swing === undefined ? 'NOT_AVAILABLE' : getStateValue(swing, 'OFF', val => val.toString().toUpperCase());
                        const set_light = light === undefined ? 'NOT_AVAILABLE' : getStateValue(light, 'OFF', val => val.toString().toUpperCase());

                        this.debugLog(`Type is: ${set_type}`);
                        this.debugLog(`Power is: ${set_power}`);
                        this.debugLog(`Temperature is: ${set_temp}`);
                        this.debugLog(`Execution mode (typeSkillBasedApp) is: ${set_mode}`);
                        this.debugLog(`DurationInSeconds is: ${set_durationInSeconds}`);
                        this.debugLog(`NextTimeBlockStart exists: ${set_NextTimeBlockStartExists}`);
                        this.debugLog(`Mode is: ${set_acMode}`);
                        this.debugLog(`FanSpeed is: ${set_fanSpeed}`);
                        this.debugLog(`FanLevel is: ${set_fanLevel}`);
                        this.debugLog(`HorizontalSwing is: ${set_horizontalSwing}`);
                        this.debugLog(`VerticalSwing is: ${set_verticalSwing}`);
                        this.debugLog(`Swing is: ${set_swing}`);
                        this.debugLog(`Light is: ${set_light}`);

                        let shouldSetOverlay = false;
                        switch (statename) {
                            case 'overlayClearZone':
                                this.debugLog(`Overlay cleared for room '${zoneId}' in home '${homeId}'`);
                                await this.setClearZoneOverlay(homeId, zoneId);
                                break;

                            case 'fahrenheit': //do the same as with celsius but just convert to celsius
                            case 'celsius':
                                if (statename == 'fahrenheit') {
                                    set_temp = Math.round((5 / 9) * (Number(state.val) - 32) * 10) / 10;
                                }
                                if (set_mode == 'NO_OVERLAY') {
                                    if (set_NextTimeBlockStartExists) {
                                        set_mode = 'NEXT_TIME_BLOCK';
                                    } else {
                                        set_mode = 'MANUAL';
                                    }
                                }
                                set_power = 'ON';
                                this.debugLog(`Temperature changed for room '${zoneId}' in home '${homeId}' to '${set_temp}'`);
                                shouldSetOverlay = true;
                                break;

                            case 'durationInSeconds':
                                set_mode = 'TIMER';
                                await this.setState(`${homeId}.Rooms.${zoneId}.overlay.termination.typeSkillBasedApp`, set_mode, true);
                            // fallthrough
                            case 'fanSpeed':
                            case 'mode':
                            case 'fanLevel':
                            case 'swing':
                            case 'light':
                            case 'horizontalSwing':
                            case 'verticalSwing':
                                shouldSetOverlay = true;
                                break;

                            case 'typeSkillBasedApp':
                                if (set_mode == 'NO_OVERLAY') {
                                    break;
                                }
                                this.debugLog(`TypeSkillBasedApp changed for room '${zoneId}' in home '${homeId}' to '${set_mode}'`);
                                if (set_mode == 'MANUAL') {
                                    await this.setState(`${homeId}.Rooms.${zoneId}.overlay.termination.expiry`, null, true);
                                    await this.setState(`${homeId}.Rooms.${zoneId}.overlay.termination.durationInSeconds`, null, true);
                                    await this.setState(`${homeId}.Rooms.${zoneId}.overlay.termination.remainingTimeInSeconds`, null, true);
                                }
                                shouldSetOverlay = true;
                                break;

                            case 'power':
                                if (set_mode == 'NO_OVERLAY') {
                                    if (set_power == 'ON') {
                                        this.debugLog(`Overlay cleared for room '${zoneId}' in home '${homeId}'`);
                                        await this.setClearZoneOverlay(homeId, zoneId);
                                    } else {
                                        set_mode = 'MANUAL';
                                        this.debugLog(
                                            `Power changed for room '${zoneId}' in home '${homeId}' to '${state.val}' and temperature '${set_temp}' and mode '${set_mode}'`,
                                        );
                                        shouldSetOverlay = true;
                                    }
                                } else {
                                    this.debugLog(
                                        `Power changed for room '${zoneId}' in home '${homeId}' to '${state.val}' and temperature '${set_temp}' and mode '${set_mode}'`,
                                    );
                                    shouldSetOverlay = true;
                                }
                                break;

                            default:
                        }
                        if (shouldSetOverlay) {
                            this.debugLog(`Calling setZoneOverlay for room '${zoneId}' in home '${homeId}' due to change in '${statename}'`);
                            await this.setZoneOverlay(homeId, zoneId, {
                                power: set_power,
                                temperature: set_temp,
                                typeSkillBasedApp: set_mode,
                                durationInSeconds: set_durationInSeconds,
                                type: set_type,
                                acMode: set_acMode,
                                fanLevel: set_fanLevel,
                                horizontalSwing: set_horizontalSwing,
                                verticalSwing: set_verticalSwing,
                                fanSpeed: set_fanSpeed,
                                swing: set_swing,
                                light: set_light,
                            });
                        }
                    }
                    this.debugLog('State change detected from different source than adapter');
                    this.debugLog(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                } catch (error) {
                    this.log.error(`Issue at state change: ${error}`);
                    console.error(`Issue at state change: ${error}`);
                    if (error instanceof Error) {
                        this.errorHandling(error);
                    }
                }
            } else {
                this.oldStatesVal[id] = state.val;
            }
        } else {
            this.debugLog(`state ${id} deleted`);
        }
    }

    //////////////////////////////////////////////////////////////////////
    /* SET API CALLS														*/
    //////////////////////////////////////////////////////////////////////
    /**
     * @param {string} homeId
     * @param {string} roomId
     * @param {string} power
     * @param {number} temperature
     * @param {string} terminationMode
     * @param {boolean} boostMode
     * @param {number} durationInSeconds
     */
    async setManualControlTadoX(homeId, roomId, power, temperature, terminationMode, boostMode, durationInSeconds) {
        return new Promise((resolve, reject) => {
            this.debouncedSetManualControlTadoX(homeId, roomId, power, temperature, terminationMode, boostMode, durationInSeconds, resolve, reject);
        });
    }

    /**
     * @param {string} homeId
     * @param {string} roomId
     * @param {string} power
     * @param {number} temperature
     * @param {string} terminationMode
     * @param {boolean} boostMode
     * @param {number} durationInSeconds
     */
    async _setManualControlTadoX(homeId, roomId, power, temperature, terminationMode, boostMode, durationInSeconds) {
        try {
            //{`"setting`":{`"power`":`"ON`",`"isBoost`":false,`"temperature`":{`"value`":18.5,`"valueRaw`":18.52,`"precision`":0.1}},`"termination`":{`"type`":`"NEXT_TIME_BLOCK`"}}
            if (power != 'ON' && power != 'OFF') {
                throw new Error(`Power has value ${power} but should have the value 'ON' or 'OFF'.`);
            }
            if (terminationMode != 'NEXT_TIME_BLOCK' && terminationMode != 'MANUAL' && terminationMode != 'TIMER') {
                throw new Error(`TerminationMode has value ${terminationMode} but should have 'NEXT_TIMEBLOCK' or 'MANUAL' or 'TIMER'.`);
            }
            temperature = Math.round(temperature * 10) / 10;

            let payload = {};
            payload.termination = {};
            payload.termination.type = terminationMode;
            payload.setting = {};
            payload.setting.power = power;
            payload.setting.isBoost = toBoolean(boostMode);

            if (power == 'OFF') {
                payload.setting.temperature = null;
            } else {
                payload.setting.temperature = {};
                payload.setting.temperature.value = temperature;
            }

            if (terminationMode == 'TIMER') {
                payload.termination.durationInSeconds = durationInSeconds;
            }

            this.debugLog(`setManualControlTadoX() payload is ${JSON.stringify(payload)}`);
            let apiResponse = await this.api.apiCall(`${TADO_X_URL}/homes/${homeId}/rooms/${roomId}/manualControl`, 'post', payload);
            this.debugLog(`setManualControlTadoX() response is ${JSON.stringify(apiResponse)}`);
            await this.manageRoomStatesTadoX(homeId, roomId);
        } catch (error) {
            this.log.error(`Issue at setManualControlTadoX(): '${error}'`);
            console.error(`Issue at setManualControlTadoX(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     * @param {string} deviceID
     * @param {number} offSet offset of the device
     */
    async setOffSetTadoX(homeId, deviceID, offSet) {
        try {
            offSet = Math.round(offSet * 10) / 10;
            if (offSet < -10 || offSet > 10) {
                this.log.warn('Temperature offset should be between -10.0 and 10.0');
                await this.sleep(3000);
                await this.manageRoomsTadoX(homeId);
                return;
            }
            const payload = { temperatureOffset: offSet };
            let apiResponse = await this.api.apiCall(`${TADO_X_URL}/homes/${homeId}/roomsAndDevices/devices/${deviceID}`, 'patch', payload);
            this.debugLog(`setOffSetTadoX() response is ${JSON.stringify(apiResponse)}`);
            await this.sleep(5000);
            await this.manageRoomsTadoX(homeId);
        } catch (error) {
            this.log.error(`Issue at setOffSetTadoX(): '${error}'`);
            console.error(`Issue at setOffSetTadoX(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     * @param {string} roomId
     */
    async setResumeRoomScheduleTadoX(homeId, roomId) {
        try {
            let apiResponse = await this.api.apiCall(`${TADO_X_URL}/homes/${homeId}/rooms/${roomId}/resumeSchedule`, 'post');
            this.debugLog(`setResumeRoomScheduleTadoX() response is ${JSON.stringify(apiResponse)}`);
            await this.manageRoomStatesTadoX(homeId, roomId);
        } catch (error) {
            this.log.error(`Issue at setResumeRoomScheduleTadoX(): '${error}'`);
            console.error(`Issue at setResumeRoomScheduleTadoX(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     */
    async setResumeHomeScheduleTadoX(homeId) {
        try {
            let apiResponse = await this.api.apiCall(`${TADO_X_URL}/homes/${homeId}/quickActions/resumeSchedule`, 'post');
            this.debugLog(`setResumeHomeScheduleTadoX() response is ${JSON.stringify(apiResponse)}`);
            await this.manageRoomsTadoX(homeId);
        } catch (error) {
            this.log.error(`Issue at setResumeHomeScheduleTadoX(): '${error}'`);
            console.error(`Issue at setResumeHomeScheduleTadoX(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     */
    async setBoostTadoX(homeId) {
        try {
            let apiResponse = await this.api.apiCall(`${TADO_X_URL}/homes/${homeId}/quickActions/boost`, 'post');
            this.debugLog(`setBoostTadoX() response is ${JSON.stringify(apiResponse)}`);
            await this.manageRoomsTadoX(homeId);
        } catch (error) {
            this.log.error(`Issue at setBoostTadoX(): '${error}'`);
            console.error(`Issue at setBoostTadoX(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     */
    async setAllOffTadoX(homeId) {
        try {
            let apiResponse = await this.api.apiCall(`${TADO_X_URL}/homes/${homeId}/quickActions/allOff`, 'post');
            this.debugLog(`setAllOffTadoX() response is ${JSON.stringify(apiResponse)}`);
            await this.manageRoomsTadoX(homeId);
        } catch (error) {
            this.log.error(`Issue at setAllOffTadoX(): '${error}'`);
            console.error(`Issue at setAllOffTadoX(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async setClearZoneOverlay(homeId, zoneId) {
        try {
            const url = `/api/v2/homes/${homeId}/zones/${zoneId}/overlay`;
            if ((await isOnline()) == false) {
                throw new Error('No internet connection detected!');
            }
            await this.api.apiCall(url, 'delete');
            this.debugLog(`Called 'DELETE ${url}'`);
            await jsonExplorer.setLastStartTime();
            await this.manageZoneStates(homeId, zoneId);
            this.debugLog('CheckExpire() at clearZoneOverlay() started');
            jsonExplorer.checkExpire(`${homeId}.Rooms.${zoneId}.overlay.*`);
        } catch (error) {
            this.log.error(`Issue at clearZoneOverlay(): '${error}'`);
            console.error(`Issue at clearZoneOverlay(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {string} deviceId
     * @param {number} set_offset
     */
    async setTemperatureOffset(homeId, zoneId, deviceId, set_offset) {
        if (!set_offset) {
            set_offset = 0;
        }
        if (set_offset <= -10 || set_offset > 10) {
            this.log.warn('Offset out of range +/-10°');
        }
        set_offset = Math.round(set_offset * 100) / 100;

        const offset = {
            celsius: Math.min(10, Math.max(-9.99, set_offset)),
        };

        try {
            if ((await isOnline()) == false) {
                throw new Error('No internet connection detected!');
            }
            let apiResponse = await this.api.apiCall(`/api/v2/devices/${deviceId}/temperatureOffset`, 'put', offset);
            this.debugLog(`API 'temperatureOffset' for home '${homeId}' and deviceID '${deviceId}' with body ${JSON.stringify(offset)} called.`);
            this.debugLog(`Response from 'temperatureOffset' is ${JSON.stringify(apiResponse)}`);
            if (apiResponse) {
                await this.manageTemperatureOffset(homeId, zoneId, deviceId, apiResponse);
            }
        } catch (error) {
            let eMsg = `Issue at setTemperatureOffset: '${error}'. Based on body ${JSON.stringify(offset)}`;
            this.log.error(eMsg);
            console.error(eMsg);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {number} timetableId
     */
    async setActiveTimeTable(homeId, zoneId, timetableId) {
        if (!timetableId) {
            timetableId = 0;
        }
        if (!(timetableId == 0 || timetableId == 1 || timetableId == 2)) {
            this.log.error(`Invalid value '${timetableId}' for state 'timetable_id'. Allowed values are '0', '1' and '2'.`);
            return;
        }
        const timeTable = {
            id: timetableId,
        };
        let apiResponse;
        this.debugLog(`setActiveTimeTable JSON ${JSON.stringify(timeTable)}`);
        //this.log.info(`Call API 'activeTimetable' for home '${homeId}' and zone '${zoneId}' with body ${JSON.stringify(timeTable)}`);
        try {
            if ((await isOnline()) == false) {
                throw new Error('No internet connection detected!');
            }
            apiResponse = await this.api.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/schedule/activeTimetable`, 'put', timeTable);

            if (apiResponse) {
                await this.manageTimeTables(homeId, zoneId, apiResponse);
            }
            this.debugLog(`API 'activeTimetable' for home '${homeId}' and zone '${zoneId}' with body ${JSON.stringify(timeTable)} called.`);
            this.debugLog(`Response from 'setActiveTimeTable' is ${JSON.stringify(apiResponse)}`);
        } catch (error) {
            let eMsg = `Issue at setActiveTimeTable: '${error}'. Based on body ${JSON.stringify(timeTable)}`;
            this.log.error(eMsg);
            console.error(eMsg);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     * @param {string} homePresence
     */
    async setPresenceLock(homeId, homePresence) {
        if (!homePresence) {
            homePresence = 'HOME';
        }
        if (homePresence !== 'HOME' && homePresence !== 'AWAY' && homePresence !== 'AUTO') {
            this.log.error(`Invalid value '${homePresence}' for state 'homePresence'. Allowed values are HOME, AWAY and AUTO.`);
            return;
        }
        const homeState = {
            homePresence: homePresence.toUpperCase(),
        };
        let apiResponse;
        this.debugLog(`homePresence JSON ${JSON.stringify(homeState)}`);
        //this.log.info(`Call API 'activeTimetable' for home '${homeId}' and zone '${zoneId}' with body ${JSON.stringify(timeTable)}`);
        try {
            if ((await isOnline()) == false) {
                throw new Error('No internet connection detected!');
            }
            if (homePresence === 'AUTO') {
                apiResponse = await this.api.apiCall(`/api/v2/homes/${homeId}/presenceLock`, 'delete');
            } else {
                apiResponse = await this.api.apiCall(`/api/v2/homes/${homeId}/presenceLock`, 'put', homeState);
            }
            await this.manageHomeState(homeId);
            this.debugLog(`API 'state' for home '${homeId}' with body ${JSON.stringify(homeState)} called.`);
            this.debugLog(`Response from 'presenceLock' is ${JSON.stringify(apiResponse)}`);
        } catch (error) {
            let eMsg = `Issue at setPresenceLock: '${error}'. Based on body ${JSON.stringify(homeState)}`;
            this.log.error(eMsg);
            console.error(eMsg);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * Sets the zone overlay with the given options.
     *
     * @param {string} homeId
     * @param {string} zoneId
     * @param {object} options
     * @param {string} options.power
     * @param {number} options.temperature
     * @param {string} options.typeSkillBasedApp
     * @param {number} options.durationInSeconds
     * @param {string} options.type
     * @param {string} options.acMode
     * @param {string} options.fanLevel
     * @param {string} options.horizontalSwing
     * @param {string} options.verticalSwing
     * @param {string} options.fanSpeed
     * @param {string} options.swing
     * @param {string} options.light
     */
    async setZoneOverlay(homeId, zoneId, options) {
        const power = options.power.toUpperCase();
        const temperature = Math.round((options.temperature ?? 20) * 100) / 100;
        const typeSkillBasedApp = options.typeSkillBasedApp.toUpperCase();
        const durationInSeconds = Math.max(10, options.durationInSeconds);
        const type = options.type.toUpperCase();
        const fanSpeed = options.fanSpeed.toUpperCase();
        const acMode = options.acMode.toUpperCase();
        const fanLevel = options.fanLevel.toUpperCase();
        const horizontalSwing = options.horizontalSwing.toUpperCase();
        const verticalSwing = options.verticalSwing.toUpperCase();
        const swing = options.swing.toUpperCase();
        const light = options.light.toUpperCase();

        let config = {
            setting: {
                type: type,
            },
        };

        try {
            config.setting.power = power;
            if (typeSkillBasedApp != 'NO_OVERLAY') {
                config.termination = {};
                config.termination.typeSkillBasedApp = typeSkillBasedApp;
                if (typeSkillBasedApp != 'TIMER') {
                    config.termination.durationInSeconds = null;
                } else {
                    config.termination.durationInSeconds = durationInSeconds;
                }
            }
            if (type != 'HEATING' && type != 'AIR_CONDITIONING' && type != 'HOT_WATER') {
                this.log.error(`Invalid value '${type}' for state 'type'. Supported values are HOT_WATER, AIR_CONDITIONING and HEATING`);
                return;
            }
            if (power != 'ON' && power != 'OFF') {
                this.log.error(`Invalid value '${power}' for state 'power'. Supported values are ON and OFF`);
                return;
            }
            if (
                typeSkillBasedApp != 'TIMER' &&
                typeSkillBasedApp != 'MANUAL' &&
                typeSkillBasedApp != 'NEXT_TIME_BLOCK' &&
                typeSkillBasedApp != 'NO_OVERLAY' &&
                typeSkillBasedApp != 'TADO_MODE'
            ) {
                this.log.error(
                    `Invalid value '${typeSkillBasedApp}' for state 'typeSkillBasedApp'. Allowed values are TIMER, MANUAL and NEXT_TIME_BLOCK`,
                );
                return;
            }

            /* Capability Management
            {"1":{"type":"HEATING","temperatures":{"celsius":{"min":5,"max":25,"step":0.1},"fahrenheit":{"min":41,"max":77,"step":0.1}}}}
            {"0":{"type":"HOT_WATER","canSetTemperature":true,"temperatures":{"celsius":{"min":30,"max":65,"step":1},"fahrenheit":{"min":86,"max":149,"step":1}}}}
            {"0":{"type":"HOT_WATER","canSetTemperature":false}}
            {"1":{"type":"AIR_CONDITIONING","COOL":{"temperatures":{"celsius":{"min":16,"max":30,"step":1},"fahrenheit":{"min":61,"max":86,"step":1}},"fanSpeeds":["AUTO","HIGH","MIDDLE","LOW"],"swings":["OFF","ON"]},"DRY":{"fanSpeeds":["MIDDLE","LOW"],"swings":["OFF","ON"]},"FAN":{"fanSpeeds":["HIGH","MIDDLE","LOW"],"swings":["OFF","ON"]},"HEAT":{"temperatures":{"celsius":{"min":16,"max":30,"step":1},"fahrenheit":{"min":61,"max":86,"step":1}},"fanSpeeds":["AUTO","HIGH","MIDDLE","LOW"],"swings":["OFF","ON"]},"initialStates":{"mode":"COOL","modes":{"COOL":{"temperature":{"celsius":23,"fahrenheit":74},"fanSpeed":"LOW","swing":"OFF"},"DRY":{"fanSpeed":"LOW","swing":"OFF"},"FAN":{"fanSpeed":"LOW","swing":"OFF"},"HEAT":{"temperature":{"celsius":23,"fahrenheit":74},"fanSpeed":"LOW","swing":"OFF"}}}},"3":{"type":"AIR_CONDITIONING","COOL":{"temperatures":{"celsius":{"min":16,"max":30,"step":1},"fahrenheit":{"min":61,"max":86,"step":1}},"fanSpeeds":["AUTO","HIGH","MIDDLE","LOW"],"swings":["OFF","ON"]},"DRY":{"fanSpeeds":["MIDDLE","LOW"],"swings":["OFF","ON"]},"FAN":{"fanSpeeds":["HIGH","MIDDLE","LOW"],"swings":["OFF","ON"]},"HEAT":{"temperatures":{"celsius":{"min":16,"max":30,"step":1},"fahrenheit":{"min":61,"max":86,"step":1}},"fanSpeeds":["AUTO","HIGH","MIDDLE","LOW"],"swings":["OFF","ON"]},"initialStates":{"mode":"COOL","modes":{"COOL":{"temperature":{"celsius":23,"fahrenheit":74},"fanSpeed":"LOW","swing":"OFF"},"DRY":{"fanSpeed":"LOW","swing":"OFF"},"FAN":{"fanSpeed":"LOW","swing":"OFF"},"HEAT":{"temperature":{"celsius":23,"fahrenheit":74},"fanSpeed":"LOW","swing":"OFF"}}}}}
            {"1":{"type":"AIR_CONDITIONING","HEAT":{"temperatures":{"celsius":{"min":16,"max":32,"step":1},"fahrenheit":{"min":61,"max":90,"step":1}},"fanLevel":["LEVEL2","LEVEL3","AUTO","LEVEL1"],"verticalSwing":["OFF","ON"],"horizontalSwing":["OFF","ON"],"light":["OFF","ON"]},"COOL":{"temperatures":{"celsius":{"min":16,"max":32,"step":1},"fahrenheit":{"min":61,"max":90,"step":1}},"fanLevel":["LEVEL2","LEVEL3","AUTO","LEVEL1"],"verticalSwing":["OFF","ON"],"horizontalSwing":["OFF","ON"],"light":["OFF","ON"]},"DRY":{"temperatures":{"celsius":{"min":16,"max":32,"step":1},"fahrenheit":{"min":61,"max":90,"step":1}},"fanLevel":["LEVEL2","LEVEL3","AUTO","LEVEL1"],"verticalSwing":["OFF","ON"],"horizontalSwing":["OFF","ON"],"light":["OFF","ON"]},"FAN":{"fanLevel":["LEVEL2","LEVEL3","LEVEL1"],"verticalSwing":["OFF","ON"],"horizontalSwing":["OFF","ON"],"light":["OFF","ON"]},"AUTO":{"fanLevel":["LEVEL2","LEVEL3","LEVEL1"],"verticalSwing":["OFF","ON"],"horizontalSwing":["OFF","ON"],"light":["OFF","ON"]},"initialStates":{"mode":"COOL","modes":{"COOL":{"temperature":{"celsius":24,"fahrenheit":76},"fanSpeed":null,"swing":null,"fanLevel":"LEVEL2","verticalSwing":"OFF","horizontalSwing":"OFF"},"HEAT":{"temperature":{"celsius":24,"fahrenheit":76},"fanSpeed":null,"swing":null,"fanLevel":"LEVEL2","verticalSwing":"OFF","horizontalSwing":"OFF"},"DRY":{"temperature":{"celsius":24,"fahrenheit":76},"fanSpeed":null,"swing":null,"fanLevel":"LEVEL2","verticalSwing":"OFF","horizontalSwing":"OFF"},"FAN":{"temperature":null,"fanSpeed":null,"swing":null,"fanLevel":"LEVEL2","verticalSwing":"OFF","horizontalSwing":"OFF"},"AUTO":{"temperature":null,"fanSpeed":null,"swing":null,"fanLevel":"LEVEL2","verticalSwing":"OFF","horizontalSwing":"OFF"}},"light":"ON"}}}
            */
            console.log(JSON.stringify(this.roomCapabilities));
            if (!this.roomCapabilities || !this.roomCapabilities[zoneId]) {
                this.log.error(`No room capabilities found for room '${zoneId}'. Capabilities looks like '${JSON.stringify(this.roomCapabilities)}'`);
                console.log(`No room capabilities found for room '${zoneId}'. Capabilities looks like '${JSON.stringify(this.roomCapabilities)}'`);
                this.sendSentryWarn('Capabilities for zone not found');
                return;
            }

            let capType = this.roomCapabilities[zoneId].type;
            if (capType && capType != type) {
                this.log.error(`Type ${type} not valid. Type ${capType} expected.`);
                return;
            }

            if (type == 'HEATING' && power == 'ON') {
                let capMinTemp, capMaxTemp;
                if (this.roomCapabilities[zoneId].temperatures && this.roomCapabilities[zoneId].temperatures.celsius) {
                    capMinTemp = this.roomCapabilities[zoneId].temperatures.celsius.min; //valid for all heating devices
                    capMaxTemp = this.roomCapabilities[zoneId].temperatures.celsius.max; //valid for all heating devices
                }

                if (capMinTemp && capMaxTemp) {
                    if (temperature > capMaxTemp || temperature < capMinTemp) {
                        this.log.error(`Temperature of ${temperature}°C outside supported range of ${capMinTemp}°C to ${capMaxTemp}°C`);
                        return;
                    }
                    config.setting.temperature = {};
                    config.setting.temperature.celsius = temperature;
                }
            }

            if (type == 'HOT_WATER' && power == 'ON') {
                let capCanSetTemperature = this.roomCapabilities[zoneId].canSetTemperature; //valid for hotwater
                let capMinTemp, capMaxTemp;
                if (this.roomCapabilities[zoneId].temperatures && this.roomCapabilities[zoneId].temperatures.celsius) {
                    capMinTemp = this.roomCapabilities[zoneId].temperatures.celsius.min; //valid for hotwater if canSetTemperature == true
                    capMaxTemp = this.roomCapabilities[zoneId].temperatures.celsius.max; //valid for hotwater if canSetTemperature == true
                }

                if (capCanSetTemperature == true) {
                    if (capMinTemp && capMaxTemp) {
                        if (temperature > capMaxTemp || temperature < capMinTemp) {
                            this.log.error(`Temperature of ${temperature}°C outside supported range of ${capMinTemp}°C to ${capMaxTemp}°C`);
                            return;
                        }
                    }
                    config.setting.temperature = {};
                    config.setting.temperature.celsius = temperature;
                }
            }

            if (type == 'AIR_CONDITIONING' && power == 'ON') {
                if (!this.roomCapabilities[zoneId][acMode]) {
                    this.log.error(`AC-Mode ${acMode} not supported! Capailities looks like ${JSON.stringify(this.roomCapabilities)}`);
                    console.log(`AC-Mode ${acMode} in Room ${zoneId} not supported! Capailities looks like ${JSON.stringify(this.roomCapabilities)}`);
                    this.sendSentryWarn('Capabilities for acMode not found');
                    return;
                }
                config.setting.mode = acMode;
                let capMinTemp, capMaxTemp;
                if (this.roomCapabilities[zoneId][acMode].temperatures && this.roomCapabilities[zoneId][acMode].temperatures.celsius) {
                    capMinTemp = this.roomCapabilities[zoneId][acMode].temperatures.celsius.min; //valide v3 & v3+
                    capMaxTemp = this.roomCapabilities[zoneId][acMode].temperatures.celsius.max; //valide v3 & v3+
                }
                let capHorizontalSwing = this.roomCapabilities[zoneId][acMode].horizontalSwing; //valide v3+
                let capVerticalSwing = this.roomCapabilities[zoneId][acMode].verticalSwing; //valide v3+
                let capFanLevel = this.roomCapabilities[zoneId][acMode].fanLevel; //valide v3+
                let capFanSpeeds = this.roomCapabilities[zoneId][acMode].fanSpeeds; //valide v3
                let capSwings = this.roomCapabilities[zoneId][acMode].swings; //valide v3
                let capLight = this.roomCapabilities[zoneId][acMode].light;

                if (capMinTemp && capMaxTemp) {
                    if (temperature > capMaxTemp || temperature < capMinTemp) {
                        this.log.error(`Temperature of ${temperature}°C outside supported range of ${capMinTemp}°C to ${capMaxTemp}°C`);
                        return;
                    }
                    config.setting.temperature = {};
                    config.setting.temperature.celsius = temperature;
                }
                if (capHorizontalSwing) {
                    if (!capHorizontalSwing.includes(horizontalSwing)) {
                        this.log.error(
                            `Invalid value '${horizontalSwing}' for state 'horizontalSwing'. Allowed values are ${JSON.stringify(capHorizontalSwing)}`,
                        );
                        return;
                    }
                    config.setting.horizontalSwing = horizontalSwing;
                }
                if (capVerticalSwing) {
                    if (!capVerticalSwing.includes(verticalSwing)) {
                        this.log.error(
                            `Invalid value '${verticalSwing}' for state 'verticalSwing'. Allowed values are ${JSON.stringify(capVerticalSwing)}`,
                        );
                        return;
                    }
                    config.setting.verticalSwing = verticalSwing;
                }
                if (capFanSpeeds) {
                    if (!capFanSpeeds.includes(fanSpeed)) {
                        this.log.error(`Invalid value '${fanSpeed}' for state 'fanSpeed'. Allowed values are ${JSON.stringify(capFanSpeeds)}`);
                        return;
                    }
                    config.setting.fanSpeed = fanSpeed;
                }
                if (capFanLevel) {
                    if (!capFanLevel.includes(fanLevel)) {
                        this.log.error(`Invalid value '${fanLevel}' for state 'fanLevel'. Allowed values are ${JSON.stringify(capFanLevel)}`);
                        return;
                    }
                    config.setting.fanLevel = fanLevel;
                }
                if (capSwings) {
                    if (!capSwings.includes(swing)) {
                        this.log.error(`Invalid value '${swing}' for state 'swing'. Allowed values are ${JSON.stringify(capSwings)}`);
                        return;
                    }
                    config.setting.swing = swing;
                }
                if (capLight) {
                    if (!capLight.includes(light)) {
                        this.log.error(`Invalid value '${light}' for state 'light'. Allowed values are ${JSON.stringify(capLight)}`);
                        return;
                    }
                    config.setting.light = light;
                }
            }

            let result = await this.setZoneOverlayDebounced(homeId, zoneId, config);
            this.debugLog(`API 'ZoneOverlay' for home '${homeId}' and zone '${zoneId}' with body ${JSON.stringify(config)} called.`);

            if (result == null) {
                throw new Error('Result of setZoneOverlay is null');
            }

            if (result.setting.temperature == null) {
                result.setting.temperature = {};
                result.setting.temperature.celsius = null;
                result.setting.temperature.fahrenheit = null;
            }
            await jsonExplorer.setLastStartTime();
            await jsonExplorer.traverseJson(result, `${homeId}.Rooms.${zoneId}.overlay`, true, true, 2);
            await jsonExplorer.traverseJson(result.setting, `${homeId}.Rooms.${zoneId}.setting`, true, true, 2);
            this.debugLog('CheckExpire() at setZoneOverlay() started');
            jsonExplorer.checkExpire(`${homeId}.Rooms.${zoneId}.overlay.*`);
        } catch (error) {
            console.log(`Body: ${JSON.stringify(config)}`);
            this.log.error(`Issue at setZoneOverlay: '${error}'. Based on config ${JSON.stringify(config)}`);
            console.error(`Issue at setZoneOverlay: '${error}'. Based on config ${JSON.stringify(config)}`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * executes the API call after 750ms. If during this time another call is requested, the timer resets.
     * To avoid mulitple API calls
     *
     * @param {string} homeId
     * @param {string} zoneId
     * @param {object} config
     */
    async setZoneOverlayDebounced(homeId, zoneId, config) {
        return new Promise((resolve, reject) => {
            this.debouncedSetZoneOverlay(homeId, zoneId, config, resolve, reject);
        });
    }

    async _setZoneOverlay(homeId, zoneId, config) {
        try {
            this.log.debug(`Calling API for setZoneOverlay with config: ${JSON.stringify(config)}`);
            const apiResponse = await this.api.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/overlay`, 'put', config, 'setZoneOverlayPool');
            this.log.debug(`API response for setZoneOverlay: ${JSON.stringify(apiResponse)}`);
            return apiResponse;
        } catch (error) {
            this.log.error(`Error in _setZoneOverlay: ${error}`);
            throw error;
        }
    }

    /**
     * Calls the "Active Open Window" endpoint. If the tado thermostat did not detect an open window, the call does nothing.
     *
     * @param {string} homeId
     * @param {string} zoneId
     */
    async setActivateOpenWindow(homeId, zoneId) {
        try {
            let url = `/api/v2/homes/${homeId}/zones/${zoneId}/state/openWindow/activate`;
            if ((await isOnline()) == false) {
                throw new Error('No internet connection detected!');
            }
            await this.api.apiCall(url, 'post');
            this.debugLog(`Called 'POST ${url}'`);
            await jsonExplorer.setLastStartTime();
            await this.manageZoneStates(homeId, zoneId);
            jsonExplorer.checkExpire(`${homeId}.Rooms.${zoneId}.openWindow.*`);
        } catch (error) {
            this.log.error(`Issue at activateOpenWindow(): '${error}'`);
            console.error(`Issue at activateOpenWindow(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {any} config Payload needs to be an object like this {"enabled":true,"timeoutInSeconds":960}
     */
    async setOpenWindowDetectionSettings(homeId, zoneId, config) {
        try {
            let url = `/api/v2/homes/${homeId}/zones/${zoneId}/openWindowDetection`;
            if ((await isOnline()) == false) {
                throw new Error('No internet connection detected!');
            }
            await this.api.apiCall(url, 'put', config);
            await jsonExplorer.setLastStartTime();
            await this.manageZoneStates(homeId, zoneId);
            jsonExplorer.checkExpire(`${homeId}.Rooms.${zoneId}.openWindowDetection.*`);
        } catch (error) {
            console.log(`Body: ${JSON.stringify(config)}`);
            this.log.error(`Issue at setOpenWindowDetectionSettings(): '${error}'`);
            console.error(`Issue at setOpenWindowDetectionSettings(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {string} deviceId
     * @param {boolean} enabled
     */
    async setChildLock(homeId, zoneId, deviceId, enabled) {
        try {
            let url = `/api/v2/devices/${deviceId}/childLock`;
            if ((await isOnline()) == false) {
                throw new Error('No internet connection detected!');
            }
            await this.api.apiCall(url, 'put', { childLockEnabled: enabled });
            await jsonExplorer.setLastStartTime();
            await this.manageZoneStates(homeId, zoneId);
            jsonExplorer.checkExpire(`${homeId}.Rooms.${zoneId}.devices.${deviceId}.childLockEnabled`);
        } catch (error) {
            this.log.error(`Issue at setChildLock(): '${error}'`);
            console.error(`Issue at setChildLock(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} HomeId
     * @param {any} [reading]
     */
    async setReading(HomeId, reading) {
        try {
            let result = await this.api.apiCall(
                `https://energy-insights.tado.com/api/homes/${HomeId}/meterReadings`,
                'post',
                JSON.stringify(reading),
            );
            this.debugLog(`setReading executed with result ${JSON.stringify(result)}`);
            await jsonExplorer.sleep(1000);
            await this.create_state(`${HomeId}.meterReadings`, 'meterReadings', JSON.stringify({}));
        } catch (error) {
            this.log.error(`Issue at setReading(): '${error}'`);
            console.error(`Issue at setReading(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    //////////////////////////////////////////////////////////////////////
    /* DO Methods														*/
    //////////////////////////////////////////////////////////////////////
    /**
     * @param {string} homeId
     */
    async manageRoomsTadoX(homeId) {
        let rooms = await this.getRoomsTadoX(homeId);
        let roomsAndDevices = await this.getRoomsAndDevicesTadoX(homeId);
        this.debugLog(`Rooms object is ${JSON.stringify(rooms)}`);
        this.debugLog(`RoomsAndDevices object is ${JSON.stringify(roomsAndDevices)}`);
        rooms.boost = false;
        rooms.resumeScheduleHome = false;
        rooms.allOff = false;

        for (const i in roomsAndDevices.rooms) {
            if (rooms[i].boostMode == null) {
                rooms[i].boostMode = {};
                rooms[i].boostMode.type = null;
                rooms[i].boostMode.projectedExpiry = null;
            }
            if (rooms[i].manualControlTermination == null) {
                rooms[i].manualControlTermination = {};
                rooms[i].manualControlTermination.projectedExpiry = null;
                rooms[i].manualControlTermination.remainingTimeInSeconds = null;
                rooms[i].manualControlTermination.controlType = null;
            } else {
                rooms[i].manualControlTermination.controlType = rooms[i].manualControlTermination.type;
                delete rooms[i].manualControlTermination.type;
            }
            rooms[i].balanceControl = rooms[i].balanceControl === null ? {} : rooms[i].balanceControl;
            rooms[i].openWindow = rooms[i].openWindow === null ? {} : rooms[i].openWindow;
            rooms[i].awayMode = rooms[i].awayMode === null ? {} : rooms[i].awayMode;
            rooms[i].holidayMode = rooms[i].holidayMode === null ? {} : rooms[i].holidayMode;
        }
        this.debugLog(`Modified rooms object is ${JSON.stringify(rooms)}`);
        await jsonExplorer.traverseJson(rooms, `${homeId}.Rooms`, true, true, 0);

        for (const i in roomsAndDevices.rooms) {
            let roomId = roomsAndDevices.rooms[i].roomId;
            //loop devices
            for (const j in roomsAndDevices.rooms[i].devices) {
                roomsAndDevices.rooms[i].devices[j].id = roomsAndDevices.rooms[i].devices[j].serialNumber;
            }
            this.debugLog(`Devices looks like ${JSON.stringify(roomsAndDevices.rooms[i].devices)}`);
            await jsonExplorer.traverseJson(
                roomsAndDevices.rooms[i].devices,
                `${homeId}.Rooms.${roomsAndDevices.rooms[i].roomId}.devices`,
                true,
                true,
                1,
            );
            await this.manageRoomStatesTadoX(homeId, roomId);
        }
    }

    /**
     * @param {string} homeId
     * @param {string} roomId
     */
    async manageRoomStatesTadoX(homeId, roomId) {
        let roomsAndDevices = await this.getroomsAndDevicesTadoX(homeId, roomId);
        if (roomsAndDevices.boostMode == null) {
            roomsAndDevices.boostMode = {};
            roomsAndDevices.boostMode.type = null;
            roomsAndDevices.boostMode.projectedExpiry = null;
        }
        if (roomsAndDevices.manualControlTermination == null) {
            roomsAndDevices.manualControlTermination = {};
            roomsAndDevices.manualControlTermination.projectedExpiry = null;
            roomsAndDevices.manualControlTermination.remainingTimeInSeconds = null;
            roomsAndDevices.manualControlTermination.controlType = null;
        } else {
            roomsAndDevices.manualControlTermination.controlType = roomsAndDevices.manualControlTermination.type;
            delete roomsAndDevices.manualControlTermination.type;
        }
        roomsAndDevices.balanceControl = roomsAndDevices.balanceControl == null ? {} : roomsAndDevices.balanceControl;
        roomsAndDevices.openWindow = roomsAndDevices.openWindow == null ? {} : roomsAndDevices.openWindow;
        roomsAndDevices.awayMode = roomsAndDevices.awayMode == null ? {} : roomsAndDevices.awayMode;
        roomsAndDevices.holidayMode = roomsAndDevices.holidayMode == null ? {} : roomsAndDevices.holidayMode;
        roomsAndDevices.resumeScheduleRoom = false;
        this.debugLog(`Modified RoomsAndDevices object is ${JSON.stringify(roomsAndDevices)}`);
        await jsonExplorer.traverseJson(roomsAndDevices, `${homeId}.Rooms.${roomId}`, true, true, 0);
    }

    async refreshData() {
        const now = new Date().getTime();
        let step = 'start';
        //outdated = now - this.lastupdate > ONEHOUR;
        //check outdate status for all objects
        for (const key in outdated) {
            if (Object.prototype.hasOwnProperty.call(outdated, key)) {
                outdated[key].isOutdated = now - outdated[key].lastUpdate > outdated[key].intervall;
                this.log.debug(`${key} is outdated: ${outdated[key].isOutdated}`);
            }
        }
        let conn_state = await this.getStateAsync('info.connection');
        if (conn_state) {
            this.debugLog(`info.connection is ${conn_state.val}`);
        }

        try {
            // Get Basic data needed for all other querys and store to global variable
            step = 'getMeData';
            if (this.getMeData == null) {
                this.getMeData = await this.getMe();
            }
            this.debugLog(`GetMe result: ${JSON.stringify(this.getMeData)}`);
            if (!this.getMeData) {
                throw new Error('getMe_data was null');
            }
            //set timestamp for 'Online'-state
            await jsonExplorer.setLastStartTime();

            for (const i in this.getMeData.homes) {
                let homeId = String(this.getMeData.homes[i].id);
                this.manageWriteJsonRespons(homeId, 'Stage_01_GetMe_Data', this.getMeData);
                this.setObjectAsync(homeId, {
                    type: 'folder',
                    common: {
                        name: homeId,
                    },
                    native: {},
                });

                step = 'DoHome';
                await this.manageHome(homeId); //API Call only needed once, because data is static

                step = 'manageMobileDevices';
                if (outdated[step].isOutdated) {
                    outdated[step].lastUpdate = now;
                    await this.manageMobileDevices(homeId);
                    jsonExplorer.checkExpire(`${homeId}.Mobile_Devices.*`);
                }

                step = 'manageWeather';
                if (outdated[step].isOutdated) {
                    outdated[step].lastUpdate = now;
                    await this.manageWeather(homeId);
                    jsonExplorer.checkExpire(`${homeId}.Weather.*`);
                }

                step = 'manageZones';
                if (this.isTadoX) {
                    await this.manageRoomsTadoX(homeId);
                } else {
                    await this.manageZones(homeId);
                }
                jsonExplorer.checkExpire(`${homeId}.Rooms.*.setting.*`);
                jsonExplorer.checkExpire(`${homeId}.Rooms.*.*Window*.*`);

                step = 'manageHomeState';
                if (outdated[step].isOutdated) {
                    outdated[step].lastUpdate = now;
                    await this.manageHomeState(homeId);
                    jsonExplorer.checkExpire(`${homeId}.Home.state.*`);
                }
            }

            if (conn_state === undefined || conn_state === null) {
                return;
            }

            if (conn_state.val === false) {
                this.log.info(`Initialisation finished, connected to Tado cloud service refreshing every ${this.intervall_time / 1000} seconds`);
                this.setState('info.connection', true, true);
            }

            // Clear running timer
            if (polling) {
                clearTimeout(polling);
                polling = null;
            }
            // timer
            polling = setTimeout(() => {
                this.connect();
            }, this.intervall_time);
            this.retryCount = 0;
            //this.log.info(`${numberOfCalls.calls} API calls since start.`);
        } catch (error) {
            this.retryCount = this.retryCount + 1;
            let retryDelay = 60 * this.retryCount;
            let eMsg = `Error in data refresh at step ${step}: ${error}`;
            this.log.error(eMsg);
            console.error(eMsg);
            if (error instanceof Error) {
                this.errorHandling(error);
            }

            if (this.retryCount <= 20) {
                this.log.error(`Disconnected from Tado cloud service ..., retry in ${retryDelay} seconds !`);
                this.setState('info.connection', false, true);
                // retry connection
                polling = setTimeout(() => {
                    for (let key in outdated) {
                        this.getMeData = null;
                        this.homeData = null;
                        this.roomCapabilities = {};
                        outdated[key].lastUpdate = 0; //reset all lastUpdate to 0 to force refresh of all data
                    }
                    this.connect();
                }, retryDelay * 1000);
            } else {
                this.log.error(`Retry limit reached! No further retries.`);
                this.setState('info.connection', false, true);
            }
        }
    }

    async connect() {
        try {
            if ((await isOnline()) == false) {
                this.log.warn(`No internet connection detected. Retry in ${this.intervall_time / 1000} seconds.`);
                // Clear running timer
                if (polling) {
                    clearTimeout(polling);
                    polling = null;
                }
                // timer
                polling = setTimeout(() => {
                    this.connect();
                }, this.intervall_time);
                return;
            }

            this.debugLog('Internet connection detected. Everything fine!');

            if (!this.accessToken.token.refresh_token) {
                this.log.error(`Adapter not running! No token configured. Go to adapter's config page and execute Step 1 and Step 2`);
                return;
            }
            await this.refreshData();
        } catch (error) {
            this.log.error(`Issue at DoConnect(): ${error}`);
            console.error(`Issue at DoConnect(): ${error}`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     */
    async manageHome(homeId) {
        // Get additional basic data for all homes
        if (this.homeData === null) {
            this.homeData = await this.getHome(homeId);
            await this.create_state(`${homeId}.meterReadings`, 'meterReadings', JSON.stringify({}));
            if (this.homeData.generation == 'LINE_X') {
                this.isTadoX = true;
                this.log.info(`TadoX is ${this.isTadoX}`);
            } else {
                this.isTadoX = false;
            }
        }
        this.debugLog(`Home_data Result: ${JSON.stringify(this.homeData)}`);
        if (this.homeData == null) {
            throw new Error('home_data is null');
        }
        if (!this.isTadoX) {
            this.homeData.masterswitch = '';
        }
        this.manageWriteJsonRespons(homeId, 'Stage_02_HomeData', this.homeData);
        await jsonExplorer.traverseJson(this.homeData, `${homeId}.Home`, true, true, 0);
    }

    /**
     * @param {string} homeId
     */
    async manageWeather(homeId) {
        const weather_data = await this.getWeather(homeId);
        if (weather_data == null) {
            throw new Error('weather_data is null');
        }
        this.debugLog(`Weather_data Result: ${JSON.stringify(weather_data)}`);
        this.manageWriteJsonRespons(homeId, 'Stage_04_Weather', weather_data);
        await jsonExplorer.traverseJson(weather_data, `${homeId}.Weather`, true, true, 0);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {string} deviceId
     * @param {object} offset
     */
    async manageTemperatureOffset(homeId, zoneId, deviceId, offset = null) {
        if (offset == null) {
            offset = await this.getTemperatureOffset(deviceId);
        }
        this.debugLog(`Offset Result for DeviceID '${deviceId}': ${JSON.stringify(offset)}`);
        if (offset == null) {
            throw new Error('offset is null');
        }
        this.manageWriteJsonRespons(homeId, `Stage_12_Offset_${homeId}`, offset);
        if (offset.celsius != undefined) {
            offset.offsetCelsius = offset.celsius;
        }
        if (offset.fahrenheit != undefined) {
            offset.offsetFahrenheit = offset.fahrenheit;
        }
        delete offset.celsius;
        delete offset.fahrenheit;
        await jsonExplorer.traverseJson(offset, `${homeId}.Rooms.${zoneId}.devices.${deviceId}.offset`, true, true, 2);
    }

    /**
     * @param {string} homeId
     */
    async manageMobileDevices(homeId) {
        this.MobileDevices_data = await this.getMobileDevices(homeId);
        if (this.MobileDevices_data == null) {
            throw new Error('MobileDevices_data is null');
        }
        this.debugLog(`MobileDevices_data Result: ${JSON.stringify(this.MobileDevices_data)}`);
        this.manageWriteJsonRespons(homeId, 'Stage_06_MobileDevicesData', this.MobileDevices_data);
        await jsonExplorer.traverseJson(this.MobileDevices_data, `${homeId}.Mobile_Devices`, true, true, 0);
    }

    /**
     * @param {string} homeId
     */
    async manageZones(homeId) {
        if (outdated['manageZones'].isOutdated) {
            outdated['manageZones'].lastUpdate = new Date().getTime();
            this.zonesData = await this.getZones(homeId);
        }
        let zones_data = structuredClone(this.zonesData);
        this.debugLog(`Zones_data Result: ${JSON.stringify(zones_data)}`);
        if (zones_data == null) {
            throw new Error('Zones_data is null');
        }
        this.manageWriteJsonRespons(homeId, 'Stage_08_ZonesData', zones_data);

        //Search for DeviceIDs to get Offset
        for (const j in zones_data) {
            for (const k in zones_data[j]) {
                for (const l in zones_data[j][k]) {
                    let zoneId = zones_data[j].id;
                    let deviceId = zones_data[j][k][l].serialNo;
                    if (deviceId != undefined) {
                        this.debugLog(`DeviceID for offset found: ${JSON.stringify(zones_data[j][k][l].serialNo)}`);
                        zones_data[j][k][l].id = zones_data[j][k][l].serialNo;
                        if (zones_data[j][k][l].duties.includes(`ZONE_LEADER`) && outdated['manageTemperatureOffset'].isOutdated) {
                            outdated['manageTemperatureOffset'].lastUpdate = new Date().getTime();
                            await this.manageTemperatureOffset(homeId, zoneId, deviceId);
                        }
                    }
                }
            }
            // Change `enabled` to `openWindowDetectionEnabled`
            zones_data[j].openWindowDetection.openWindowDetectionEnabled = zones_data[j].openWindowDetection.enabled;
            delete zones_data[j].openWindowDetection.enabled;
        }

        await jsonExplorer.traverseJson(zones_data, `${homeId}.Rooms`, true, true, 0);

        for (const i in zones_data) {
            let zoneId = zones_data[i].id;
            await this.manageZoneStates(homeId, zoneId);
            await this.manageCapabilities(homeId, zoneId);
            await this.manageAwayConfiguration(homeId, zoneId);
            await this.manageTimeTables(homeId, zoneId);
        }
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async manageZoneStates(homeId, zoneId) {
        let ZonesState_data = await this.getZoneState(homeId, zoneId);
        if (ZonesState_data == null) {
            throw new Error('ZonesState_data is null');
        }
        this.debugLog(`ZoneStates_data result for room '${zoneId}' is ${JSON.stringify(ZonesState_data)}`);

        if (ZonesState_data.setting.temperature === null) {
            ZonesState_data.setting.temperature = {};
            ZonesState_data.setting.temperature.celsius = null; //add states to be subsribed
            ZonesState_data.setting.temperature.fahrenheit = null;
        }
        ZonesState_data.overlay = ZonesState_data.overlay === null ? {} : ZonesState_data.overlay;
        ZonesState_data.openWindow = ZonesState_data.openWindow === null ? {} : ZonesState_data.openWindow;
        ZonesState_data.preparation = ZonesState_data.preparation === null ? {} : ZonesState_data.preparation;
        ZonesState_data.nextScheduleChange = ZonesState_data.nextScheduleChange === null ? {} : ZonesState_data.nextScheduleChange;
        ZonesState_data.nextTimeBlock = ZonesState_data.nextTimeBlock === null ? {} : ZonesState_data.nextTimeBlock;

        this.manageWriteJsonRespons(homeId, `Stage_09_ZoneStates_data_${zoneId}`, ZonesState_data);
        ZonesState_data.overlayClearZone = false;
        ZonesState_data.activateOpenWindow = false;
        await jsonExplorer.traverseJson(ZonesState_data, `${homeId}.Rooms.${zoneId}`, true, true, 2);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async manageCapabilities(homeId, zoneId) {
        let capabilities_data;
        if (this.roomCapabilities[zoneId]) {
            capabilities_data = this.roomCapabilities[zoneId];
        } else {
            capabilities_data = await this.getCapabilities(homeId, zoneId);
        }
        if (capabilities_data == null) {
            throw new Error('capabilities_data is null');
        }
        this.roomCapabilities[zoneId] = capabilities_data;
        this.debugLog(`Capabilities_data result for room '${zoneId}' is ${JSON.stringify(capabilities_data)}`);
        this.manageWriteJsonRespons(homeId, `Stage_09_Capabilities_data_${zoneId}`, capabilities_data);
        await jsonExplorer.traverseJson(capabilities_data, `${homeId}.Rooms.${zoneId}.capabilities`, true, true, 2);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {object} timeTablesDataInput
     */
    async manageTimeTables(homeId, zoneId, timeTablesDataInput = null) {
        if (timeTablesDataInput != null) {
            this.timeTablesData = timeTablesDataInput;
        } else {
            if (outdated['manageTimeTables'].isOutdated) {
                outdated['manageTimeTables'].lastUpdate = new Date().getTime();
                this.timeTablesData = await this.getTimeTables(homeId, zoneId);
            }
        }
        if (this.timeTablesData == null) {
            throw new Error('TimeTables_data is null');
        }
        this.timeTablesData.tt_id = this.timeTablesData.id;
        delete this.timeTablesData.id;
        this.debugLog(`ZoneOverlay_data Result: ${JSON.stringify(this.timeTablesData)}`);
        this.manageWriteJsonRespons(homeId, `Stage_13_TimeTables_${zoneId}`, this.timeTablesData);
        this.debugLog(`Timetable for room ${zoneId} is ${JSON.stringify(this.timeTablesData)}`);
        await jsonExplorer.traverseJson(this.timeTablesData, `${homeId}.Rooms.${zoneId}.timeTables`, true, true, 2);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async manageAwayConfiguration(homeId, zoneId) {
        if (outdated['manageAwayConfiguration'].isOutdated) {
            outdated['manageAwayConfiguration'].lastUpdate = new Date().getTime();
            this.awayConfigurationData = await this.getAwayConfiguration(homeId, zoneId);
        }
        if (this.awayConfigurationData == null) {
            throw new Error('AwayConfiguration_data is null');
        }
        this.debugLog(`AwayConfiguration_data Result: ${JSON.stringify(this.awayConfigurationData)}`);
        this.manageWriteJsonRespons(homeId, `Stage_10_AwayConfiguration_${zoneId}`, this.awayConfigurationData);
        await jsonExplorer.traverseJson(this.awayConfigurationData, `${homeId}.Rooms.${zoneId}.awayConfig`, true, true, 2);
    }

    /**
     * @param {string} homeId
     * @param {string} state_name
     * @param {any} value
     */
    async manageWriteJsonRespons(homeId, state_name, value) {
        try {
            if (this.log.level == 'debug' || this.log.level == 'silly') {
                this.debugLog(`JSON data written for ${state_name} with values: ${JSON.stringify(value)}`);
                this.debugLog(`HomeId ${homeId} name: ${state_name}${state_name} value ${JSON.stringify(value)}`);

                await this.setObjectNotExistsAsync(`${homeId}._JSON_response`, {
                    type: 'device',
                    common: {
                        name: 'Plain JSON data from API',
                    },
                    native: {},
                });
                await this.create_state(`${homeId}._JSON_response.${state_name}`, state_name, JSON.stringify(value));
            }
        } catch (error) {
            this.log.error(`Issue at DoWriteJsonRespons(): '${error}'`);
            console.error(`Issue at DoWriteJsonRespons(): '${error}'`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    /**
     * @param {string} homeId
     * @param {object} homeStateData
     */
    async manageHomeState(homeId, homeStateData = null) {
        if (homeStateData == null) {
            homeStateData = await this.getHomeState(homeId);
        }
        if (homeStateData == null) {
            throw new Error('homeState_data is null');
        }
        this.debugLog(`HomeState_data Result: ${JSON.stringify(homeStateData)}`);
        this.manageWriteJsonRespons(homeId, 'Stage_11_HomeState', homeStateData);
        await jsonExplorer.traverseJson(homeStateData, `${homeId}.Home.state`, true, true, 1);
    }

    //////////////////////////////////////////////////////////////////////
    /* MASTERSWITCH														*/
    //////////////////////////////////////////////////////////////////////
    /**
     * @param {string} masterSwitch
     */
    async setMasterSwitch(masterSwitch) {
        masterSwitch = masterSwitch.toUpperCase();
        if (masterSwitch != 'ON' && masterSwitch != 'OFF') {
            this.log.error(`Masterswitch value 'ON' or 'OFF' expected but received '${masterSwitch}'`);
            return;
        }
        try {
            const states = await this.getStatesAsync('*.Rooms.*.link.state');
            for (const idS in states) {
                let path = idS.split('.');
                let homeId = path[2];
                let zoneId = path[4];
                let powerPath = `${homeId}.Rooms.${zoneId}.setting.power`;
                let overlayClearZonePath = `${homeId}.Rooms.${zoneId}.overlayClearZone`;
                let typeSkillBasedAppPath = `${homeId}.Rooms.${zoneId}.overlay.termination.typeSkillBasedApp`;
                const settingType = await this.getStateAsync(`${homeId}.Rooms.${zoneId}.setting.type`);
                if (settingType && settingType.val == 'HEATING') {
                    if (masterSwitch == 'ON') {
                        await this.setState(overlayClearZonePath, true);
                    } else {
                        await this.setState(powerPath, 'OFF');
                        await this.setState(typeSkillBasedAppPath, 'MANUAL');
                    }
                    await this.sleep(600);
                }
            }
        } catch (error) {
            this.log.error(`Issue at getAllPowerSwitches(): ${error}`);
            console.error(`Issue at getAllPowerSwitches(): ${error}`);
            if (error instanceof Error) {
                this.errorHandling(error);
            }
        }
    }

    //////////////////////////////////////////////////////////////////////
    /* TOKEN MANAGEMENT													*/
    //////////////////////////////////////////////////////////////////////
    async refreshToken() {
        const id = `#${Math.floor(Math.random() * 1000)}#`;
        const expires_at = new Date(this.accessToken.token.expires_at);
        if (this.refreshTokenInProgress == false) {
            //check for expire only if refreshToken is not in progress
            this.shouldRefreshToken =
                expires_at.getTime() - new Date().getTime() < TOKEN_EXPIRATION_WINDOW * 1000 || this.accessToken.token.expires_at == undefined;
            //this.shouldRefreshToken = true; //for testing only
            this.debugLog(`Need to refreshT is ${this.shouldRefreshToken} as expire time is ${expires_at}`);
            /*setTimeout(() => {
                this.refreshToken();
            }, 70);*/ //for testing only
        } else {
            this.debugLog(`RefreshT in progress, therfore I just wait until refresh is done... [${id}]`);
            let i = 0;
            while (this.refreshTokenInProgress && this.shouldRefreshToken) {
                //waiting until refreshToken is finished
                this.debugLog(`Waiting for refreshT to be finished... [${id} / ${i}]`);
                await this.sleep(500);
                this.debugLog(`Waiting done! [${id} / ${i}]`);
                i++;
                if (i > 10) {
                    break;
                }
            }
        }

        return new Promise((resolve, reject) => {
            if (this.shouldRefreshToken) {
                this.refreshTokenInProgress = true;
                this.debugLog(`RefreshT started [${id}]`);
                let uri = `/token?client_id=${CLIENT_ID}&grant_type=refresh_token&refresh_token=${this.accessToken.token.refresh_token}`;
                this.log.debug(`Uri for refresh token is ${uri}`);
                axiosInstanceToken
                    .post(uri, { timeout: 10000 })
                    .then(async responseRaw => {
                        let result = await this.manageNewToken(responseRaw.data);
                        this.debugLog(`RefreshT done [${id}]`);
                        resolve(result);
                        this.shouldRefreshToken = false;
                        this.refreshTokenInProgress = false;
                    })
                    .catch(error => {
                        if (error?.response?.data) {
                            if (error?.response?.data?.error) {
                                console.error(`RefreshT error is: ${error.response.data.error}`);
                                this.log.error(`Refresh-Token error is: ${error.response.data.error}`);
                                if (error.response.data.error.includes('invalid_grant')) {
                                    this.log.warn('If this error happens again, re-create token in adapter settings by starting with step 1');
                                }
                            } else {
                                console.error(`${error} with response ${JSON.stringify(error.response.data)}`);
                                this.log.error(`${error} with response ${JSON.stringify(error.response.data)}`);
                            }
                        }
                        this.refreshTokenInProgress = false;
                        reject(error);
                    });
            } else {
                resolve(this.accessToken);
            }
        });
    }

    /**
     * @param {{ access_token: any; expires_in: number; refresh_token: any; }} responseData
     */
    async manageNewToken(responseData) {
        this.log.debug(`Response data from refresh t_o_k_e_n is ${JSON.stringify(responseData)}`);
        this.debugLog('ManageT startet');
        this.accessToken.token.access_token = responseData.access_token;
        let expires_atMs = responseData.expires_in * 1000 + new Date().getTime();
        this.accessToken.token.expires_at = new Date(expires_atMs);
        this.accessToken.token.refresh_token = responseData.refresh_token;
        this.log.debug(`New accessT is ${JSON.stringify(this.accessToken)}`);
        await this.updateTokenSetForAdapter(this.accessToken);
        this.debugLog('ManageT done');
        return this.accessToken;
    }

    /**
     * @param {any} tokenSet
     */
    async updateTokenSetForAdapter(tokenSet) {
        await this.extendObject(`_config`, {
            native: {
                tokenSet,
            },
        });
    }

    //////////////////////////////////////////////////////////////////////
    /* MISC																*/
    //////////////////////////////////////////////////////////////////////

    /**
     * @param {number} waitingTimeMin
     * @param {number} waitingTimeMax
     */
    async sleep(waitingTimeMin, waitingTimeMax = waitingTimeMin) {
        let ms = Math.round(Math.random() * (waitingTimeMax - waitingTimeMin) + waitingTimeMin);
        this.debugLog(`Waiting time is ${ms}ms`);
        await jsonExplorer.sleep(ms);
        return;
    }

    /**
     * @param {string} state
     * @param {string} name
     * @param {any} value
     */
    async create_state(state, name, value) {
        this.debugLog(`Create_state called for state '${state}' and name '${name}' with value '${value}'`);
        const intervall_time = this.config.intervall * 4;
        if (value != undefined) {
            jsonExplorer.stateSetCreate(state, name, value, intervall_time);
        }
    }
    /**
     * @param {Error} errorObject
     */
    async errorHandling(errorObject) {
        try {
            if (errorObject instanceof Error == false) {
                return;
            }

            let message = errorObject.message ?? '';
            // @ts-expect-error status exists
            let status = parseInt(errorObject.status ?? 0);

            if (status == 401 || status == 403 || status == 429 || status == 504) {
                return;
            }
            if (
                message.includes('ECONNRESET') ||
                message.includes('socket hang up') ||
                message.includes('ETIMEDOUT') ||
                message.includes('EAI_AGAIN') ||
                message.includes('No internet connection detected')
            ) {
                return;
            }

            if (this.log.level != 'debug' && this.log.level != 'silly') {
                if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
                    const sentryInstance = this.getPluginInstance('sentry');
                    const sentry = sentryInstance?.getSentryObject();
                    if (sentry) {
                        sentry.setTag('tadoX', this.isTadoX);
                        sentry.captureException(errorObject);
                    }
                }
            }
        } catch (error) {
            console.log(error);
            this.log.error(`${error}at errorHandling()`);
        }
    }

    /**
     * @param {string} message
     */
    async sendSentryWarn(message) {
        try {
            if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
                const sentryInstance = this.getPluginInstance('sentry');
                const sentry = sentryInstance?.getSentryObject();
                sentry?.withScope(scope => {
                    scope.setLevel('warning');
                    sentry.setTag('tadoX', this.isTadoX);
                    sentry.captureMessage(message);
                });
            }
        } catch (error) {
            this.log.error(`${error} at sendSentryWarn()`);
            console.log(error);
        }
    }

    async resetTimer() {
        const states = await this.getStatesAsync('*.Rooms.*.link');
        for (const idS in states) {
            let deviceId = idS.split('.');
            let pooltimerid = deviceId[2] + deviceId[4];
            this.debugLog(`Check if timer ${pooltimerid} to be cleared.`);
            if (pooltimer[pooltimerid]) {
                clearTimeout(pooltimer[pooltimerid]);
                pooltimer[pooltimerid] = null;
                this.debugLog(`Timer ${pooltimerid} cleared.`);
            }
        }
        if (polling) {
            clearTimeout(polling);
            polling = null;
            this.debugLog(`Polling-Timer cleared.`);
        }
    }

    /**
     * @param {string} message
     */
    debugLog(message) {
        this.log.debug(message);
        console.log(message);
    }

    //////////////////////////////////////////////////////////////////////
    /* GET METHODS														*/
    //////////////////////////////////////////////////////////////////////
    async getMe() {
        return await this.api.apiCall('/api/v2/me');
    }

    // Read account information and all home related data
    /**
     * @param {string} homeId
     */
    async getHome(homeId) {
        return this.api.apiCall(`/api/v2/homes/${homeId}`);
    }

    // Get weather information for home location
    /**
     * @param {string} homeId
     */
    async getWeather(homeId) {
        return await this.api.apiCall(`/api/v2/homes/${homeId}/weather`);
    }

    /**
     * @param {string} homeId
     */
    async getMobileDevices(homeId) {
        return await this.api.apiCall(`/api/v2/homes/${homeId}/mobileDevices`);
    }

    /**
     * @param {string} homeId
     */
    async getZones(homeId) {
        return await this.api.apiCall(`/api/v2/homes/${homeId}/zones`);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async getZoneState(homeId, zoneId) {
        return await this.api.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/state`);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async getCapabilities(homeId, zoneId) {
        return await this.api.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/capabilities`);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async getAwayConfiguration(homeId, zoneId) {
        return await this.api.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/awayConfiguration`);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async getTimeTables(homeId, zoneId) {
        return await this.api.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/schedule/activeTimetable`);
    }

    /**
     * @param {string} deviceId
     */
    async getTemperatureOffset(deviceId) {
        return await this.api.apiCall(`/api/v2/devices/${deviceId}/temperatureOffset`);
    }

    /**
     * @param {string} homeId
     */
    async getHomeState(homeId) {
        return await this.api.apiCall(`/api/v2/homes/${homeId}/state`);
    }

    /**
     * @param {string} homeId
     */
    async getRoomsTadoX(homeId) {
        return this.api.apiCall(`${TADO_X_URL}/homes/${homeId}/rooms`);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async getroomsAndDevicesTadoX(homeId, zoneId) {
        return this.api.apiCall(`${TADO_X_URL}/homes/${homeId}/rooms/${zoneId}`);
    }

    /**
     * @param {string} homeId
     */
    async getRoomsAndDevicesTadoX(homeId) {
        return this.api.apiCall(`${TADO_X_URL}/homes/${homeId}/roomsAndDevices`);
    }
}

//////////////////////////////////////////////////////////////////////
/* HELPERS														    */
//////////////////////////////////////////////////////////////////////

/**
 * @param {string | number | boolean} valueToBoolean
 * @returns {boolean}
 */
function toBoolean(valueToBoolean) {
    return valueToBoolean === true || valueToBoolean === 'true';
}

/**
 * @param {ioBroker.State | null | undefined} state
 * @param {T} defaultValue
 * @param {(val: any) => T} [processFunc]
 * @returns {T}
 * @template T
 */
function getStateValue(state, defaultValue, processFunc) {
    const value = state?.val;
    if (value == null || value === '') {
        return defaultValue;
    }
    if (processFunc) {
        return processFunc(value);
    }
    // eslint-disable-next-line jsdoc/check-tag-names
    return /** @type {T} */ (value);
}

// @ts-expect-error parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options]
     */
    module.exports = options => new Tado(options);
} else {
    // otherwise start the instance directly
    new Tado();
}

/**
 * @param {string} inputString is a string that may contain numbers starting with / or /RU or /SU or /VA
 * @returns {string} returns the input string with all numbers replaced by 'x' while retaining the prefix
 */
/*function replaceNumbers(inputString) {
    const regex = /(\/SU|\/VA|\/RU|\/)\d+/g; // Regular expression to find numbers that start with / or /RU or /SU or /VA
    const replacedString = inputString.replace(regex, (match, prefix) => {
        // Replacement function called for each matching pattern
        const numberPart = match.substring(prefix.length); // The prefix (/ or /RU or /SU or /VA) is retained
        const replacedNumberPart = numberPart.replace(/\d/g, 'x'); // Replaces each digit in the number part with 'x'
        return prefix + replacedNumberPart; // Returns the prefix and the replaced number part
    });
    return replacedString;
}*/

/*const asyncCallWithTimeout = async (asyncPromise, timeLimit) => {
    let timeoutHandle;

    const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutHandle = setTimeout(
            () => reject(new Error('Async call timeout limit reached')),
            timeLimit
        );
    });

    return Promise.race([asyncPromise, timeoutPromise]).then(result => {
        clearTimeout(timeoutHandle);
        return result;
    });
};*/
