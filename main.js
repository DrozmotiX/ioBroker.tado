'use strict';

const utils = require('@iobroker/adapter-core');
const EXPIRATION_WINDOW_IN_SECONDS = 10;
const EXPIRATION_LOGIN_WINDOW_IN_SECONDS = 10;

const tado_auth_url = 'https://auth.tado.com';
const tado_url = 'https://my.tado.com';
const tado_app_url = `https://app.tado.com/`;
const tadoX_url = `https://hops.tado.com`;
let tado_config = {
    client: {
        id: 'tado-web-app',
        secret: 'jNQ4HugiN6oIi_GlcqzyRHcN7NPM1qXsSpJ0Rm4neeZHYUIsw63bBuKE-DzRLfR5',
    },
    auth: {
        tokenHost: tado_auth_url,
    }
};
const { ResourceOwnerPassword } = require('simple-oauth2');
const jsonExplorer = require('iobroker-jsonexplorer');
const state_attr = require(`${__dirname}/lib/state_attr.js`); // Load attribute library
const isOnline = require('@esm2cjs/is-online').default;
const https = require('https');
const axios = require('axios');
const { version } = require('./package.json');

// @ts-ignore
let axiosInstance = axios.create({
    timeout: 20000, //20000
    baseURL: `${tado_url}/`,
    httpsAgent: new https.Agent({ keepAlive: true }),
    referer: tado_app_url,
    origin: tado_app_url
});

const axiosInstanceToken = axios.create({
    baseURL: 'https://login.tado.com/'
});

const ONEHOUR = 60 * 60 * 1000;
let polling; // Polling timer
let pooltimer = [];

class Tado extends utils.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        // @ts-ignore
        super({
            ...options,
            name: 'tado',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this.on('message', this.onMessage.bind(this));
        jsonExplorer.init(this, state_attr);
        this.getMe_data = null;
        this.home_data = null;
        this.lastupdate = 0;
        this.apiCallinExecution = false;
        this.intervall_time = 60 * 1000;
        this.roomCapabilities = {};
        this.oldStatesVal = [];
        this.isTadoX = false;
        this.device_code = '';

    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        jsonExplorer.sendVersionInfo(version);
        this.log.info('Started with JSON-Explorer version ' + jsonExplorer.version);
        this.intervall_time = Math.max(30, this.config.intervall) * 1000;

        const tokenObject = await this.getObjectAsync('_config');
        this.log.info('tokenObject ' + JSON.stringify(tokenObject));
        this.accessToken = tokenObject && tokenObject.native && tokenObject.native.tokenSet ? tokenObject.native.tokenSet : null;
        this.log.info('accessToken ' + JSON.stringify(this.accessToken));

        if (this.accessToken == null) {
            this.accessToken = {};
            this.accessToken.token = {};
            this.accessToken.token.refresh_token = '';
        }

        // Reset the connection indicator during startup
        await jsonExplorer.stateSetCreate('info.connection', 'connection', false);
        await this.DoConnect();
    }

    async onMessage(msg) {
        this.log.info('message');
        if (typeof msg === 'object' && msg.message) {
            this.log.debug(`Message received: ${JSON.stringify(msg)}`);
            switch (msg.command) {
                case 'auth1': {
                    const args = msg.message;
                    this.log.info(`Received OAuth start message: ${JSON.stringify(args)}`);
                    //let response = await this.apiCall(`https://login.tado.com/oauth2/device_authorize?client_id=1bb50063-6b0c-4d11-bd99-387f4a91cc46&scope=offline_access`, 'post', {});
                    let that = this;
                    axiosInstanceToken.post(`https://login.tado.com/oauth2/device_authorize?client_id=1bb50063-6b0c-4d11-bd99-387f4a91cc46&scope=offline_access`, {})
                        .then(function (responseRaw) {
                            let response = responseRaw.data;
                            that.log.info(JSON.stringify(response));
                            that.device_code = response.device_code;
                            let uri = response.verification_uri_complete;
                            msg.callback && that.sendTo(msg.from, msg.command, { error: `Copy address in your browser and proceed ${uri}` }, msg.callback);
                        })
                        .catch(error => {
                            this.log.info(error);
                        });
                    break;
                }
                case 'auth2': {
                    //this.device_code = 'a5mFlWSddNNC_6vsRTk1P8w1c1yP00qyLeliPrCzdVQ';
                    const args = msg.message;
                    this.log.info(`Received FollowwUp message: ${JSON.stringify(args)}`);
                    //let response = await this.apiCall(`https://login.tado.com/oauth2/token?client_id=1bb50063-6b0c-4d11-bd99-387f4a91cc46&device_code=${this.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`, 'post', {});
                    let that = this;
                    const uri = `https://login.tado.com/oauth2/token?client_id=1bb50063-6b0c-4d11-bd99-387f4a91cc46&device_code=${this.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`;
                    this.log.info('call ' + uri);
                    axiosInstanceToken.post(uri, {})
                        .then(async function (responseRaw) {
                            let response = responseRaw.data;
                            that.log.info(JSON.stringify(response));
                            that.accessToken.token.access_token = response.access_token;
                            let expireMS = response.expires_in * 1000 + new Date().getTime();
                            that.log.info(expireMS + '');
                            that.accessToken.token.expires_at = new Date(expireMS);
                            that.accessToken.token.refresh_token = response.refresh_token;
                            that.log.info('TOKEN is ' + JSON.stringify(that.accessToken));
                            await that.updateTokenSetForAdapter(that.accessToken);
                            msg.callback && that.sendTo(msg.from, msg.command, { error: `Done!` }, msg.callback);
                        })
                        .catch(error => {
                            this.log.info(error);
                        });
                    break;
                }
            }
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
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
        this.log.debug(id + ' changed');
        const temperature = await this.getStateAsync(homeId + '.Rooms.' + roomId + '.setting.temperature.value');
        const mode = await this.getStateAsync(homeId + '.Rooms.' + roomId + '.manualControlTermination.controlType');
        const power = await this.getStateAsync(homeId + '.Rooms.' + roomId + '.setting.power');
        const remainingTimeInSeconds = await this.getStateAsync(homeId + '.Rooms.' + roomId + '.manualControlTermination.remainingTimeInSeconds');
        const nextTimeBlockStart = await this.getStateAsync(homeId + '.Rooms.' + roomId + '.nextTimeBlock.start');
        const boostMode = await this.getStateAsync(homeId + '.Rooms.' + roomId + '.boostMode');

        const set_boostMode = (boostMode == null || boostMode == undefined || boostMode.val == null || boostMode.val == '') ? false : toBoolean(boostMode.val);
        const set_remainingTimeInSeconds = (remainingTimeInSeconds == null || remainingTimeInSeconds == undefined || remainingTimeInSeconds.val == null) ? 1800 : parseInt(remainingTimeInSeconds.val.toString());
        const set_temp = (temperature == null || temperature == undefined || temperature.val == null || temperature.val == '') ? 20 : parseFloat(temperature.val.toString());
        const set_NextTimeBlockStartExists = (nextTimeBlockStart == null || nextTimeBlockStart == undefined || nextTimeBlockStart.val == null || nextTimeBlockStart.val == '') ? false : true;
        let set_power = (power == null || power == undefined || power.val == null || power.val == '') ? 'OFF' : power.val.toString().toUpperCase();
        let set_terminationMode = (mode == null || mode == undefined || mode.val == null || mode.val == '') ? 'NO_OVERLAY' : mode.val.toString().toUpperCase();

        this.log.debug('boostMode is: ' + set_boostMode);
        this.log.debug('Power is: ' + set_power);
        this.log.debug(`Temperature is: ${set_temp}`);
        this.log.debug('Termination mode is: ' + set_terminationMode);
        this.log.debug('RemainingTimeInSeconds is: ' + set_remainingTimeInSeconds);
        this.log.debug('NextTimeBlockStart exists: ' + set_NextTimeBlockStartExists);
        this.log.debug('DevicId is: ' + deviceId);

        switch (statename) {
            case ('power'):
                if (set_terminationMode == 'NO_OVERLAY') {
                    if (set_power == 'ON') {
                        this.log.debug(`Overlay cleared for room '${roomId}' in home '${homeId}'`);
                        await this.setResumeRoomScheduleTadoX(homeId, roomId);
                        break;
                    }
                    else {
                        set_terminationMode = 'MANUAL';
                    }
                }

                await this.setManualControlTadoX(homeId, roomId, set_power, set_temp, set_terminationMode, set_boostMode, set_remainingTimeInSeconds);
                if (set_power == 'OFF') jsonExplorer.stateSetCreate(homeId + '.Rooms.' + roomId + '.setting.temperature.value', 'value', null);
                break;

            case ('value'):
                if (beforeStatename != 'temperature') {
                    this.log.warn('Change of ' + id + ' ignored'); break;
                }

                if (set_terminationMode == 'NO_OVERLAY') {
                    if (set_NextTimeBlockStartExists) set_terminationMode = 'NEXT_TIME_BLOCK';
                    else set_terminationMode = 'MANUAL';
                }
                set_power = 'ON';
                await this.setManualControlTadoX(homeId, roomId, set_power, set_temp, set_terminationMode, set_boostMode, set_remainingTimeInSeconds);
                break;

            case ('boost'):
                if (state.val == true) {
                    await this.setBoostTadoX(homeId);
                    await jsonExplorer.sleep(1000);
                    this.create_state(id, 'boost', false);
                }
                break;

            case ('resumeScheduleHome'):
                if (state.val == true) {
                    await this.setResumeHomeScheduleTadoX(homeId);
                    await jsonExplorer.sleep(1000);
                    this.create_state(id, 'resumeScheduleHome', false);
                }
                break;

            case ('resumeScheduleRoom'):
                if (state.val == true) {
                    await this.setResumeRoomScheduleTadoX(homeId, roomId);
                    await jsonExplorer.sleep(1000);
                    this.create_state(id, 'resumeScheduleRoom', false);
                }
                break;

            case ('allOff'):
                if (state.val == true) {
                    await this.setAllOffTadoX(homeId);
                    await jsonExplorer.sleep(1000);
                    this.create_state(id, 'allOff', false);
                }
                break;

            case ('remainingTimeInSeconds'):
                set_terminationMode = 'TIMER';
                await this.setManualControlTadoX(homeId, roomId, set_power, set_temp, set_terminationMode, set_boostMode, set_remainingTimeInSeconds);
                break;

            case ('controlType'):
                if (beforeStatename != 'manualControlTermination') {
                    this.log.warn('Change of ' + id + ' ignored'); break;
                }
                await this.setManualControlTadoX(homeId, roomId, set_power, set_temp, set_terminationMode, set_boostMode, set_remainingTimeInSeconds);
                break;
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {
        if (state) {
            // The state was changed
            if (state.ack === false) {
                if (this.oldStatesVal[id] === state.val) {
                    this.log.debug(`State ${id} did not change, value is ${state.val}. No further actions!`);
                    return;
                }
                try {
                    this.log.debug('GETS INTERESSTING!!!');
                    const idSplitted = id.split('.');
                    const homeId = idSplitted[2];
                    const zoneId = idSplitted[4];
                    const deviceId = idSplitted[6];
                    const statename = idSplitted[idSplitted.length - 1];
                    const beforeStatename = idSplitted[idSplitted.length - 2];
                    this.log.debug(`Attribute '${id}' changed. '${statename}' will be checked.`);

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
                                this.log.error('dmeterReadings.date hat other format thanYYYY-MM-DD');
                                return;
                            }
                            await this.setReading(homeId, meterReadings);
                        } else {
                            this.log.error('meterReadings does not contain date and reading');
                            return;
                        }
                    }
                    else if (statename == 'offsetCelsius') {
                        const offset = state;
                        let set_offset = (offset == null || offset == undefined || offset.val == null) ? 0 : parseFloat(offset.val.toString());
                        this.log.debug(`Offset changed for device '${deviceId}' in home '${homeId}' to value '${set_offset}'`);
                        this.setTemperatureOffset(homeId, zoneId, deviceId, set_offset);
                    } else if (statename == 'childLockEnabled') {
                        const childLockEnabled = state;
                        let set_childLockEnabled = (childLockEnabled == null || childLockEnabled == undefined || childLockEnabled.val == null || childLockEnabled.val == '') ? false : toBoolean(childLockEnabled.val);
                        this.log.debug(`ChildLockEnabled changed for device '${deviceId}' in home '${homeId}' to value '${set_childLockEnabled}'`);
                        this.setChildLock(homeId, zoneId, deviceId, set_childLockEnabled);
                    } else if (statename == 'tt_id') {
                        const tt_id = state;
                        let set_tt_id = (tt_id == null || tt_id == undefined || tt_id.val == null || tt_id.val == '') ? 0 : parseInt(tt_id.val.toString());
                        this.log.debug(`TimeTable changed for room '${zoneId}' in home '${homeId}' to value '${set_tt_id}'`);
                        this.setActiveTimeTable(homeId, zoneId, set_tt_id);
                    } else if (statename == 'presence') {
                        const presence = state;
                        let set_presence = (presence == null || presence == undefined || presence.val == null || presence.val == '') ? 'HOME' : presence.val.toString().toUpperCase();
                        this.log.debug(`Presence changed in home '${homeId}' to value '${set_presence}'`);
                        this.setPresenceLock(homeId, set_presence);
                    } else if (statename == 'masterswitch') {
                        const masterswitch = state;
                        let set_masterswitch = (masterswitch == null || masterswitch == undefined || masterswitch.val == null || masterswitch.val == '') ? 'unknown' : masterswitch.val.toString().toUpperCase();
                        this.log.debug(`Masterswitch changed in home '${homeId}' to value '${set_masterswitch}'`);
                        await this.setMasterSwitch(set_masterswitch);
                        await this.sleep(1000);
                        await this.setState(`${homeId}.Home.masterswitch`, '', true);
                    } else if (statename == 'activateOpenWindow') {
                        this.log.debug(`Activate Open Window for room '${zoneId}' in home '${homeId}'`);
                        await this.setActivateOpenWindow(homeId, zoneId);
                    } else if (idSplitted[idSplitted.length - 2] === 'openWindowDetection' && (statename == 'openWindowDetectionEnabled' || statename == 'timeoutInSeconds')) {
                        const openWindowDetectionEnabled = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.openWindowDetection.openWindowDetectionEnabled');
                        const openWindowDetectionTimeoutInSeconds = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.openWindowDetection.timeoutInSeconds');
                        let set_openWindowDetectionEnabled = (openWindowDetectionEnabled == null || openWindowDetectionEnabled == undefined || openWindowDetectionEnabled.val == null || openWindowDetectionEnabled.val == '') ? false : toBoolean(openWindowDetectionEnabled.val);
                        let set_openWindowDetectionTimeoutInSeconds = (openWindowDetectionTimeoutInSeconds == null || openWindowDetectionTimeoutInSeconds == undefined || openWindowDetectionTimeoutInSeconds.val == null || openWindowDetectionTimeoutInSeconds.val == '') ? 900 : Number(openWindowDetectionTimeoutInSeconds.val);

                        this.log.debug('Open Window Detection enabled: ' + set_openWindowDetectionEnabled);
                        this.log.debug('Open Window Detection Timeout is: ' + set_openWindowDetectionTimeoutInSeconds);

                        this.log.debug(`Changing open window detection for '${zoneId}' in home '${homeId}'`);
                        await this.setOpenWindowDetectionSettings(homeId, zoneId, {
                            enabled: set_openWindowDetectionEnabled,
                            timeoutInSeconds: set_openWindowDetectionTimeoutInSeconds
                        });
                    } else {
                        const type = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.type');
                        const temperature = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.temperature.celsius');
                        const mode = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.overlay.termination.typeSkillBasedApp');
                        const power = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.power');
                        const durationInSeconds = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.overlay.termination.durationInSeconds');
                        const nextTimeBlockStart = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.nextTimeBlock.start');
                        let acMode, fanLevel, horizontalSwing, verticalSwing, fanSpeed, swing, light;

                        let set_type = (type == null || type == undefined || type.val == null || type.val == '') ? 'HEATING' : type.val.toString().toUpperCase();
                        let set_durationInSeconds = (durationInSeconds == null || durationInSeconds == undefined || durationInSeconds.val == null) ? 1800 : parseInt(durationInSeconds.val.toString());
                        let set_temp = (temperature == null || temperature == undefined || temperature.val == null || temperature.val == '') ? 20 : parseFloat(temperature.val.toString());
                        let set_power = (power == null || power == undefined || power.val == null || power.val == '') ? 'OFF' : power.val.toString().toUpperCase();
                        let set_mode = (mode == null || mode == undefined || mode.val == null || mode.val == '') ? 'NO_OVERLAY' : mode.val.toString().toUpperCase();
                        let set_NextTimeBlockStartExists = (nextTimeBlockStart == null || nextTimeBlockStart == undefined || nextTimeBlockStart.val == null || nextTimeBlockStart.val == '') ? false : true;

                        if (set_type == 'AIR_CONDITIONING') {
                            acMode = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.mode');
                            fanSpeed = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.fanSpeed');
                            fanLevel = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.fanLevel');
                            horizontalSwing = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.horizontalSwing');
                            verticalSwing = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.verticalSwing');
                            swing = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.swing');
                            light = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.light');
                        }
                        let set_light = '', set_swing = '', set_horizontalSwing = '', set_verticalSwing = '', set_fanLevel = '', set_fanSpeed = '', set_acMode = '';
                        if (acMode == undefined) set_acMode = 'NOT_AVAILABLE';
                        else {
                            set_acMode = (acMode == null || acMode.val == null || acMode.val == '') ? 'COOL' : acMode.val.toString().toUpperCase();
                        }
                        if (fanSpeed == undefined) set_fanSpeed = 'NOT_AVAILABLE';
                        else {
                            set_fanSpeed = (fanSpeed == null || fanSpeed.val == null || fanSpeed.val == '') ? 'AUTO' : fanSpeed.val.toString().toUpperCase();
                        }
                        if (fanLevel == undefined) set_fanLevel = 'NOT_AVAILABLE';
                        else {
                            set_fanLevel = (fanLevel == null || fanLevel.val == null || fanLevel.val == '') ? 'AUTO' : fanLevel.val.toString().toUpperCase();
                        }
                        if (horizontalSwing == undefined) set_horizontalSwing = 'NOT_AVAILABLE';
                        else {
                            set_horizontalSwing = (horizontalSwing == null || horizontalSwing.val == null || horizontalSwing.val == '') ? 'OFF' : horizontalSwing.val.toString().toUpperCase();
                        }
                        if (verticalSwing == undefined) set_verticalSwing = 'NOT_AVAILABLE';
                        else {
                            set_verticalSwing = (verticalSwing == null || verticalSwing.val == null || verticalSwing.val == '') ? 'OFF' : verticalSwing.val.toString().toUpperCase();
                        }
                        if (swing == undefined) set_swing = 'NOT_AVAILABLE';
                        else {
                            set_swing = (swing == null || swing.val == null || swing.val == '') ? 'OFF' : swing.val.toString().toUpperCase();
                        }
                        if (light == undefined) set_light = 'NOT_AVAILABLE';
                        else {
                            set_light = (light == null || light.val == null || light.val == '') ? 'OFF' : light.val.toString().toUpperCase();
                        }
                        this.log.debug('Type is: ' + set_type);
                        this.log.debug('Power is: ' + set_power);
                        this.log.debug(`Temperature is: ${set_temp}`);
                        this.log.debug('Execution mode (typeSkillBasedApp) is: ' + set_mode);
                        this.log.debug('DurationInSeconds is: ' + set_durationInSeconds);
                        this.log.debug('NextTimeBlockStart exists: ' + set_NextTimeBlockStartExists);
                        this.log.debug('Mode is: ' + set_acMode);
                        this.log.debug('FanSpeed is: ' + set_fanSpeed);
                        this.log.debug('FanLevel is: ' + set_fanLevel);
                        this.log.debug('HorizontalSwing is: ' + set_horizontalSwing);
                        this.log.debug('VerticalSwing is: ' + set_verticalSwing);
                        this.log.debug('Swing is: ' + set_swing);
                        this.log.debug('Light is: ' + set_light);

                        switch (statename) {
                            case ('overlayClearZone'):
                                this.log.debug(`Overlay cleared for room '${zoneId}' in home '${homeId}'`);
                                await this.setClearZoneOverlay(homeId, zoneId);
                                break;

                            case ('fahrenheit'): //do the same as with celsius but just convert to celsius
                            case ('celsius'):
                                if (statename == 'fahrenheit') {
                                    set_temp = Math.round((5 / 9) * (Number(state.val) - 32) * 10) / 10;
                                }
                                if (set_mode == 'NO_OVERLAY') {
                                    if (set_NextTimeBlockStartExists) set_mode = 'NEXT_TIME_BLOCK';
                                    else set_mode = 'MANUAL';
                                }
                                set_power = 'ON';
                                this.log.debug(`Temperature changed for room '${zoneId}' in home '${homeId}' to '${set_temp}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('durationInSeconds'):
                                set_mode = 'TIMER';
                                this.log.debug(`DurationInSecond changed for room '${zoneId}' in home '${homeId}' to '${set_durationInSeconds}'`);
                                await this.setState(`${homeId}.Rooms.${zoneId}.overlay.termination.typeSkillBasedApp`, set_mode, true);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('fanSpeed'):
                                this.log.debug(`FanSpeed changed for room '${zoneId}' in home '${homeId}' to '${set_fanSpeed}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('mode'):
                                this.log.debug(`Mode changed for room '${zoneId}' in home '${homeId}' to '${set_acMode}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('fanLevel'):
                                this.log.debug(`fanLevel changed for room '${zoneId}' in home '${homeId}' to '${set_fanLevel}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('swing'):
                                this.log.debug(`swing changed for room '${zoneId}' in home '${homeId}' to '${set_swing}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('light'):
                                this.log.debug(`light changed for room '${zoneId}' in home '${homeId}' to '${set_light}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('horizontalSwing'):
                                this.log.debug(`horizontalSwing changed for room '${zoneId}' in home '${homeId}' to '${set_horizontalSwing}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('verticalSwing'):
                                this.log.debug(`verticalSwing changed for room '${zoneId}' in home '${homeId}' to '${set_verticalSwing}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('typeSkillBasedApp'):
                                if (set_mode == 'NO_OVERLAY') { break; }
                                this.log.debug(`TypeSkillBasedApp changed for room '${zoneId}' in home '${homeId}' to '${set_mode}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                if (set_mode == 'MANUAL') {
                                    await this.setState(`${homeId}.Rooms.${zoneId}.overlay.termination.expiry`, null, true);
                                    await this.setState(`${homeId}.Rooms.${zoneId}.overlay.termination.durationInSeconds`, null, true);
                                    await this.setState(`${homeId}.Rooms.${zoneId}.overlay.termination.remainingTimeInSeconds`, null, true);
                                }
                                break;

                            case ('power'):
                                if (set_mode == 'NO_OVERLAY') {
                                    if (set_power == 'ON') {
                                        this.log.debug(`Overlay cleared for room '${zoneId}' in home '${homeId}'`);
                                        await this.setClearZoneOverlay(homeId, zoneId);
                                    }
                                    else {
                                        set_mode = 'MANUAL';
                                        this.log.debug(`Power changed for room '${zoneId}' in home '${homeId}' to '${state.val}' and temperature '${set_temp}' and mode '${set_mode}'`);
                                        await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                    }
                                } else {
                                    this.log.debug(`Power changed for room '${zoneId}' in home '${homeId}' to '${state.val}' and temperature '${set_temp}' and mode '${set_mode}'`);
                                    await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                }
                                break;

                            default:
                        }
                    }
                    this.log.debug('State change detected from different source than adapter');
                    this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                } catch (error) {
                    this.log.error(`Issue at state change: ${error}`);
                    console.error(`Issue at state change: ${error}`);
                    this.errorHandling(error);
                }

            } else {
                this.oldStatesVal[id] = state.val;
                this.log.debug(`Changed value ${state.val} for ID ${id} stored`);
                this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            }
        } else {
            // The state was deleted
            this.log.debug(`state ${id} deleted`);
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
        //{`"setting`":{`"power`":`"ON`",`"isBoost`":false,`"temperature`":{`"value`":18.5,`"valueRaw`":18.52,`"precision`":0.1}},`"termination`":{`"type`":`"NEXT_TIME_BLOCK`"}}
        if (power != 'ON' && power != 'OFF') throw new Error(`Power has value ${power} but should have the value 'ON' or 'OFF'.`);
        if (terminationMode != 'NEXT_TIME_BLOCK' && terminationMode != 'MANUAL' && terminationMode != 'TIMER') throw new Error(`TerminationMode has value ${terminationMode} but should have 'NEXT_TIMEBLOCK' or 'MANUAL' or 'TIMER'.`);
        temperature = Math.round(temperature * 10) / 10;

        let payload = {};
        payload.termination = {};
        payload.termination.type = terminationMode;
        payload.setting = {};
        payload.setting.power = power;
        payload.setting.isBoost = toBoolean(boostMode);

        if (power == 'OFF') payload.setting.temperature = null;
        else {
            payload.setting.temperature = {};
            payload.setting.temperature.value = temperature;
        }

        if (terminationMode == 'TIMER') payload.termination.durationInSeconds = durationInSeconds;

        this.log.debug('setManualControlTadoX() payload is ' + JSON.stringify(payload));
        let apiResponse = await this.apiCall(`${tadoX_url}/homes/${homeId}/rooms/${roomId}/manualControl`, 'post', payload);
        this.log.debug('setManualControlTadoX() response is ' + JSON.stringify(apiResponse));
        await this.DoRoomsStateTadoX(homeId, roomId);
    }

    /**
     * @param {string} homeId
     * @param {string} roomId
     */
    async setResumeRoomScheduleTadoX(homeId, roomId) {
        let apiResponse = await this.apiCall(`${tadoX_url}/homes/${homeId}/rooms/${roomId}/resumeSchedule`, 'post');
        this.log.debug('setResumeRoomScheduleTadoX() response is ' + JSON.stringify(apiResponse));
        await this.DoRoomsStateTadoX(homeId, roomId);
    }

    /**
     * @param {string} homeId
     */
    async setResumeHomeScheduleTadoX(homeId) {
        let apiResponse = await this.apiCall(`${tadoX_url}/homes/${homeId}/quickActions/resumeSchedule`, 'post');
        this.log.debug('setResumeHomeScheduleTadoX() response is ' + JSON.stringify(apiResponse));
        await this.DoRoomsTadoX(homeId);
    }

    /**
     * @param {string} homeId
     */
    async setBoostTadoX(homeId) {
        let apiResponse = await this.apiCall(`${tadoX_url}/homes/${homeId}/quickActions/boost`, 'post');
        this.log.debug('setBoostTadoX() response is ' + JSON.stringify(apiResponse));
        await this.DoRoomsTadoX(homeId);
    }

    /**
     * @param {string} homeId
     */
    async setAllOffTadoX(homeId) {
        let apiResponse = await this.apiCall(`${tadoX_url}/homes/${homeId}/quickActions/allOff`, 'post');
        this.log.debug('setAllOffTadoX() response is ' + JSON.stringify(apiResponse));
        await this.DoRoomsTadoX(homeId);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async setClearZoneOverlay(homeId, zoneId) {
        try {
            let url = `/api/v2/homes/${homeId}/zones/${zoneId}/overlay`;
            if (await isOnline() == false) {
                throw new Error('No internet connection detected!');
            }
            await this.apiCall(url, 'delete');
            this.log.debug(`Called 'DELETE ${url}'`);
            await jsonExplorer.setLastStartTime();
            await this.DoZoneStates(homeId, zoneId);
            this.log.debug('CheckExpire() at clearZoneOverlay() started');
            await jsonExplorer.checkExpire(homeId + '.Rooms.' + zoneId + '.overlay.*');
        }
        catch (error) {
            this.log.error(`Issue at clearZoneOverlay(): '${error}'`);
            console.error(`Issue at clearZoneOverlay(): '${error}'`);
            this.errorHandling(error);
        }
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {string} deviceId
     * @param {number} set_offset
     */
    async setTemperatureOffset(homeId, zoneId, deviceId, set_offset) {
        if (!set_offset) set_offset = 0;
        if (set_offset <= -10 || set_offset > 10) this.log.warn('Offset out of range +/-10°');
        set_offset = Math.round(set_offset * 100) / 100;

        const offset = {
            celsius: Math.min(10, Math.max(-9.99, set_offset))
        };

        try {
            if (await isOnline() == false) {
                throw new Error('No internet connection detected!');
            }
            let apiResponse = await this.apiCall(`/api/v2/devices/${deviceId}/temperatureOffset`, 'put', offset);
            this.log.debug(`API 'temperatureOffset' for home '${homeId}' and deviceID '${deviceId}' with body ${JSON.stringify(offset)} called.`);
            this.log.debug(`Response from 'temperatureOffset' is ${JSON.stringify(apiResponse)}`);
            if (apiResponse) await this.DoTemperatureOffset(homeId, zoneId, deviceId, apiResponse);
        }
        catch (error) {
            let eMsg = `Issue at setTemperatureOffset: '${error}'. Based on body ${JSON.stringify(offset)}`;
            this.log.error(eMsg);
            console.error(eMsg);
            this.errorHandling(error);
        }
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {number} timetableId
     */
    async setActiveTimeTable(homeId, zoneId, timetableId) {
        if (!timetableId) timetableId = 0;
        if (!(timetableId == 0 || timetableId == 1 || timetableId == 2)) {
            this.log.error(`Invalid value '${timetableId}' for state 'timetable_id'. Allowed values are '0', '1' and '2'.`);
            return;
        }
        const timeTable = {
            id: timetableId
        };
        let apiResponse;
        this.log.debug('setActiveTimeTable JSON ' + JSON.stringify(timeTable));
        //this.log.info(`Call API 'activeTimetable' for home '${homeId}' and zone '${zoneId}' with body ${JSON.stringify(timeTable)}`);
        try {
            if (await isOnline() == false) {
                throw new Error('No internet connection detected!');
            }
            apiResponse = await this.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/schedule/activeTimetable`, 'put', timeTable);

            if (apiResponse) await this.DoTimeTables(homeId, zoneId, apiResponse);
            this.log.debug(`API 'activeTimetable' for home '${homeId}' and zone '${zoneId}' with body ${JSON.stringify(timeTable)} called.`);
            this.log.debug(`Response from 'setActiveTimeTable' is ${JSON.stringify(apiResponse)}`);
        }
        catch (error) {
            let eMsg = `Issue at setActiveTimeTable: '${error}'. Based on body ${JSON.stringify(timeTable)}`;
            this.log.error(eMsg);
            console.error(eMsg);
            this.errorHandling(error);
        }
    }

    /**
     * @param {string} homeId
     * @param {string} homePresence
     */
    async setPresenceLock(homeId, homePresence) {
        if (!homePresence) homePresence = 'HOME';
        if (homePresence !== 'HOME' && homePresence !== 'AWAY' && homePresence !== 'AUTO') {
            this.log.error(`Invalid value '${homePresence}' for state 'homePresence'. Allowed values are HOME, AWAY and AUTO.`);
            return;
        }
        const homeState = {
            homePresence: homePresence.toUpperCase()
        };
        let apiResponse;
        this.log.debug('homePresence JSON ' + JSON.stringify(homeState));
        //this.log.info(`Call API 'activeTimetable' for home '${homeId}' and zone '${zoneId}' with body ${JSON.stringify(timeTable)}`);
        try {
            if (await isOnline() == false) {
                throw new Error('No internet connection detected!');
            }
            if (homePresence === 'AUTO') {
                apiResponse = await this.apiCall(`/api/v2/homes/${homeId}/presenceLock`, 'delete');
            } else {
                apiResponse = await this.apiCall(`/api/v2/homes/${homeId}/presenceLock`, 'put', homeState);
            }
            await this.DoHomeState(homeId);
            this.log.debug(`API 'state' for home '${homeId}' with body ${JSON.stringify(homeState)} called.`);
            this.log.debug(`Response from 'presenceLock' is ${JSON.stringify(apiResponse)}`);
        }
        catch (error) {
            let eMsg = `Issue at setPresenceLock: '${error}'. Based on body ${JSON.stringify(homeState)}`;
            this.log.error(eMsg);
            console.error(eMsg);
            this.errorHandling(error);
        }
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {string} power
     * @param {number} temperature
     * @param {string} typeSkillBasedApp
     * @param {number} durationInSeconds
     * @param {string} type
     * @param {string} acMode
     * @param {string} fanLevel
     * @param {string} horizontalSwing
     * @param {string} verticalSwing
     * @param {string} fanSpeed
     * @param {string} swing
     * @param {string} light
     */
    async setZoneOverlay(homeId, zoneId, power, temperature, typeSkillBasedApp, durationInSeconds, type, acMode, fanLevel, horizontalSwing, verticalSwing, fanSpeed, swing, light) {
        power = power.toUpperCase();
        typeSkillBasedApp = typeSkillBasedApp.toUpperCase();
        durationInSeconds = Math.max(10, durationInSeconds);
        type = type.toUpperCase();
        fanSpeed = fanSpeed.toUpperCase();
        acMode = acMode.toUpperCase();
        fanLevel = fanLevel.toUpperCase();
        horizontalSwing = horizontalSwing.toUpperCase();
        verticalSwing = verticalSwing.toUpperCase();
        swing = swing.toUpperCase();
        light = light.toUpperCase();
        if (!temperature) temperature = 21;
        temperature = Math.round(temperature * 100) / 100;

        let config = {
            setting: {
                type: type,
            }
        };

        try {
            config.setting.power = power;
            if (typeSkillBasedApp != 'NO_OVERLAY') {
                config.termination = {};
                config.termination.typeSkillBasedApp = typeSkillBasedApp;
                if (typeSkillBasedApp != 'TIMER') {
                    config.termination.durationInSeconds = null;
                }
                else {
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
            if (typeSkillBasedApp != 'TIMER' && typeSkillBasedApp != 'MANUAL' && typeSkillBasedApp != 'NEXT_TIME_BLOCK' && typeSkillBasedApp != 'NO_OVERLAY' && typeSkillBasedApp != 'TADO_MODE') {
                this.log.error(`Invalid value '${typeSkillBasedApp}' for state 'typeSkillBasedApp'. Allowed values are TIMER, MANUAL and NEXT_TIME_BLOCK`);
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
                    capMinTemp = this.roomCapabilities[zoneId].temperatures.celsius.min;	//valid for all heating devices
                    capMaxTemp = this.roomCapabilities[zoneId].temperatures.celsius.max;	//valid for all heating devices
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
                let capCanSetTemperature = this.roomCapabilities[zoneId].canSetTemperature;	//valid for hotwater
                let capMinTemp, capMaxTemp;
                if (this.roomCapabilities[zoneId].temperatures && this.roomCapabilities[zoneId].temperatures.celsius) {
                    capMinTemp = this.roomCapabilities[zoneId].temperatures.celsius.min;		//valid for hotwater if canSetTemperature == true
                    capMaxTemp = this.roomCapabilities[zoneId].temperatures.celsius.max;		//valid for hotwater if canSetTemperature == true
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
                    capMinTemp = this.roomCapabilities[zoneId][acMode].temperatures.celsius.min;	//valide v3 & v3+
                    capMaxTemp = this.roomCapabilities[zoneId][acMode].temperatures.celsius.max;	//valide v3 & v3+
                }
                let capHorizontalSwing = this.roomCapabilities[zoneId][acMode].horizontalSwing;	//valide v3+
                let capVerticalSwing = this.roomCapabilities[zoneId][acMode].verticalSwing;		//valide v3+
                let capFanLevel = this.roomCapabilities[zoneId][acMode].fanLevel;					//valide v3+
                let capFanSpeeds = this.roomCapabilities[zoneId][acMode].fanSpeeds;				//valide v3
                let capSwings = this.roomCapabilities[zoneId][acMode].swings;						//valide v3
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
                        this.log.error(`Invalid value '${horizontalSwing}' for state 'horizontalSwing'. Allowed values are ${JSON.stringify(capHorizontalSwing)}`);
                        return;
                    }
                    config.setting.horizontalSwing = horizontalSwing;
                }
                if (capVerticalSwing) {
                    if (!capVerticalSwing.includes(verticalSwing)) {
                        this.log.error(`Invalid value '${verticalSwing}' for state 'verticalSwing'. Allowed values are ${JSON.stringify(capVerticalSwing)}`);
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

            let result = await this.setZoneOverlayPool(homeId, zoneId, config);
            this.log.debug(`API 'ZoneOverlay' for home '${homeId}' and zone '${zoneId}' with body ${JSON.stringify(config)} called.`);

            if (result == null) throw new Error('Result of setZoneOverlay is null');

            if (result.setting.temperature == null) {
                result.setting.temperature = {};
                result.setting.temperature.celsius = null;
                result.setting.temperature.fahrenheit = null;
            }
            await jsonExplorer.setLastStartTime();
            await jsonExplorer.traverseJson(result, homeId + '.Rooms.' + zoneId + '.overlay', true, true, 2);
            await jsonExplorer.traverseJson(result.setting, homeId + '.Rooms.' + zoneId + '.setting', true, true, 2);
            this.log.debug('CheckExpire() at setZoneOverlay() started');
            await jsonExplorer.checkExpire(homeId + '.Rooms.' + zoneId + '.overlay.*');
        }
        catch (error) {
            console.log(`Body: ${JSON.stringify(config)}`);
            this.log.error(`Issue at setZoneOverlay: '${error}'. Based on config ${JSON.stringify(config)}`);
            console.error(`Issue at setZoneOverlay: '${error}'. Based on config ${JSON.stringify(config)}`);
            this.errorHandling(error);
        }
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {object} config
     */
    async setZoneOverlayPool(homeId, zoneId, config) {
        this.log.debug(`poolApiCall() entered for '${homeId}/${zoneId}'`);
        let pooltimerid = homeId + zoneId;
        if (await isOnline() == false) {
            if (pooltimer[pooltimerid]) {
                clearTimeout(pooltimer[pooltimerid]);
                pooltimer[pooltimerid] = null;
            }
            throw new Error('No internet connection detected!');
        }
        if (pooltimer[pooltimerid]) {  //Important, that there is no await function between clearTimeout() and setTimeout())
            clearTimeout(pooltimer[pooltimerid]);
            pooltimer[pooltimerid] = null;
        }
        let that = this;
        return new Promise((resolve, reject) => {
            pooltimer[pooltimerid] = setTimeout(async () => {
                that.log.debug(`750ms queuing done [timer:'${pooltimerid}']. API will be caled.`);
                await that.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/overlay`, 'put', config).then(apiResponse => {
                    resolve(apiResponse);
                    that.log.debug(`API request finalized for '${homeId}/${zoneId}'`);
                }).catch(error => {
                    reject(error);
                });
                that.log.debug(`API called with ${JSON.stringify(config)}`);
            }, 750);
        });
    }

    /**
     * Calls the "Active Open Window" endpoint. If the tado thermostat did not detect an open window, the call does nothing.
     * @param {string} homeId
     * @param {string} zoneId
     */
    async setActivateOpenWindow(homeId, zoneId) {
        try {
            let url = `/api/v2/homes/${homeId}/zones/${zoneId}/state/openWindow/activate`;
            if (await isOnline() == false) {
                throw new Error('No internet connection detected!');
            }
            await this.apiCall(url, 'post');
            this.log.debug(`Called 'POST ${url}'`);
            await jsonExplorer.setLastStartTime();
            await this.DoZoneStates(homeId, zoneId);
            await jsonExplorer.checkExpire(homeId + '.Rooms.' + zoneId + '.openWindow.*');
        }
        catch (error) {
            this.log.error(`Issue at activateOpenWindow(): '${error}'`);
            console.error(`Issue at activateOpenWindow(): '${error}'`);
            this.errorHandling(error);
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
            if (await isOnline() == false) {
                throw new Error('No internet connection detected!');
            }
            await this.apiCall(url, 'put', config);
            await jsonExplorer.setLastStartTime();
            await this.DoZoneStates(homeId, zoneId);
            await jsonExplorer.checkExpire(homeId + '.Rooms.' + zoneId + '.openWindowDetection.*');
        }
        catch (error) {
            console.log(`Body: ${JSON.stringify(config)}`);
            this.log.error(`Issue at setOpenWindowDetectionSettings(): '${error}'`);
            console.error(`Issue at setOpenWindowDetectionSettings(): '${error}'`);
            this.errorHandling(error);
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
            if (await isOnline() == false) {
                throw new Error('No internet connection detected!');
            }
            await this.apiCall(url, 'put', { childLockEnabled: enabled });
            await jsonExplorer.setLastStartTime();
            await this.DoZoneStates(homeId, zoneId);
            await jsonExplorer.checkExpire(`${homeId}.Rooms.${zoneId}.devices.${deviceId}.childLockEnabled`);

        }
        catch (error) {
            this.log.error(`Issue at setChildLock(): '${error}'`);
            console.error(`Issue at setChildLock(): '${error}'`);
            this.errorHandling(error);
        }
    }

    /**
     * @param {string} HomeId
     * @param {any} [reading]
     */
    async setReading(HomeId, reading) {
        try {
            let result = await this.apiCall(`https://energy-insights.tado.com/api/homes/${HomeId}/meterReadings`, 'post', JSON.stringify(reading));
            this.log.debug('setReading executed with result ' + JSON.stringify(result));
            await jsonExplorer.sleep(1000);
            await this.create_state(HomeId + '.meterReadings', 'meterReadings', JSON.stringify({}));
        }
        catch (error) {
            this.log.error(`Issue at setReading(): '${error}'`);
            console.error(`Issue at setReading(): '${error}'`);
            this.errorHandling(error);
        }
    }

    //////////////////////////////////////////////////////////////////////
    /* DO Methods														*/
    //////////////////////////////////////////////////////////////////////
    async DoRoomsTadoX(homeId) {
        let rooms = await this.getRoomsTadoX(homeId);
        let roomsAndDevices = await this.getRoomsAndDevicesTadoX(homeId);
        this.log.debug('Rooms object is ' + JSON.stringify(rooms));
        this.log.debug('RoomsAndDevices object is ' + JSON.stringify(roomsAndDevices));
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
        }
        this.log.debug('Modified rooms object is' + JSON.stringify(rooms));
        await jsonExplorer.traverseJson(rooms, `${homeId}.Rooms`, true, true, 0);

        for (const i in roomsAndDevices.rooms) {
            let roomId = roomsAndDevices.rooms[i].roomId;
            //loop devices
            for (const j in roomsAndDevices.rooms[i].devices) {
                roomsAndDevices.rooms[i].devices[j].id = roomsAndDevices.rooms[i].devices[j].serialNumber;
            }
            this.log.debug('Devices looks like ' + JSON.stringify(roomsAndDevices.rooms[i].devices));
            await jsonExplorer.traverseJson(roomsAndDevices.rooms[i].devices, `${homeId}.Rooms.${roomsAndDevices.rooms[i].roomId}.devices`, true, true, 1);
            await this.DoRoomsStateTadoX(homeId, roomId);
        }
    }

    async DoRoomsStateTadoX(homeId, roomId) {
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
        roomsAndDevices.resumeScheduleRoom = false;
        this.log.debug('Modified RoomsAndDevices object is ' + JSON.stringify(roomsAndDevices));
        await jsonExplorer.traverseJson(roomsAndDevices, `${homeId}.Rooms.${roomId}`, true, true, 0);
    }

    async DoData_Refresh(user, pass) {
        let now = new Date().getTime();
        let step = 'start';
        let outdated = now - this.lastupdate > ONEHOUR;
        let conn_state = await this.getStateAsync('info.connection');
        this.log.debug('ConnState ' + JSON.stringify(conn_state));

        // Get login token
        try {/*
            if (!this.accessToken || !this.accessToken.token || new Date(this.accessToken.token.expires_at).getTime() - new Date().getTime() < EXPIRATION_LOGIN_WINDOW_IN_SECONDS * 1000) {
                step = 'login';
                await this.login(user, pass);
                if (conn_state === undefined || conn_state === null) {
                    return;
                } else {
                    if (conn_state.val === false) {
                        this.log.info('Connected to Tado cloud, initialyzing... ');
                    }
                }
            } else this.log.info('Token still valid. No Re-Login needed ' + this.accessToken.token.expires_at);
            */
            if (!this.accessToken.token.refresh_token) {
                //this.setForeignState('system.adapter.' + this.namespace + '.alive', false);
                throw new Error('Token noch nicht konfiguriert!');
            }

            // Get Basic data needed for all other querys and store to global variable
            this.log.info('getMe_data');
            step = 'getMet_data';
            if (this.getMe_data === null) {
                this.getMe_data = await this.getMe();
            }
            this.log.debug('GetMe result: ' + JSON.stringify(this.getMe_data));
            if (!this.getMe_data) throw new Error('getMe_data was null');
            //set timestamp for 'Online'-state
            await jsonExplorer.setLastStartTime();

            for (const i in this.getMe_data.homes) {
                let homeId = String(this.getMe_data.homes[i].id);
                this.DoWriteJsonRespons(homeId, 'Stage_01_GetMe_Data', this.getMe_data);
                this.setObjectAsync(homeId, {
                    'type': 'folder',
                    'common': {
                        'name': homeId,
                    },
                    'native': {},
                });

                if (outdated) {
                    this.log.debug('Full refresh, data outdated (more than 60 minutes ago)');
                    this.lastupdate = now;
                    step = 'DoHome';
                    await this.create_state(homeId + '.meterReadings', 'meterReadings', JSON.stringify({}));
                    await this.DoHome(homeId);
                }
                step = 'DoMobileDevices';
                await this.DoMobileDevices(homeId);
                step = 'DoZones';
                if (this.isTadoX) await this.DoRoomsTadoX(homeId);
                else await this.DoZones(homeId);
                step = 'DoWeather';
                await this.DoWeather(homeId);
                step = 'DoHomeState';
                await this.DoHomeState(homeId);

                //set all outdated states to NULL
                step = `Set outdated states to null`;
                if (outdated) {
                    this.log.debug('CheckExpire() at DoDataRefresh() if outdated started');
                    await jsonExplorer.checkExpire(homeId + '.*');
                } else {
                    this.log.debug('CheckExpire() at DoDataRefresh() if not outdated started');
                    await jsonExplorer.checkExpire(homeId + '.Rooms.*');
                    await jsonExplorer.checkExpire(homeId + '.Weather.*');
                    await jsonExplorer.checkExpire(homeId + '.Mobile_Devices.*');
                }
            }

            if (conn_state === undefined || conn_state === null) {
                return;
            } else {

                if (conn_state.val === false) {
                    this.log.info(`Initialisation finished, connected to Tado cloud service refreshing every ${this.intervall_time / 1000} seconds`);
                    this.setState('info.connection', true, true);
                }
            }

            // Clear running timer
            if (polling) {
                clearTimeout(polling);
                polling = null;
            }
            this.log.info('Timer erstellen');
            // timer
            polling = setTimeout(() => {
                this.DoConnect();
            }, this.intervall_time);
        } catch (error) {
            let eMsg = `Error in data refresh at step ${step}: ${error}`;
            this.log.error(eMsg);
            console.error(eMsg);
            this.errorHandling(error);
            this.log.error('Disconnected from Tado cloud service ..., retry in 30 seconds ! ');
            this.setState('info.connection', false, true);
            // retry connection
            polling = setTimeout(() => {
                this.DoConnect();
            }, 30000);
        }
    }

    async DoConnect() {
        try {
            // @ts-ignore
            const user = this.config.Username;
            // @ts-ignore
            let pass = this.config.Password;

            if (await isOnline() == false) {
                this.log.warn(`No internet connection detected. Retry in ${this.intervall_time / 1000} seconds.`);
                // Clear running timer
                if (polling) {
                    clearTimeout(polling);
                    polling = null;
                }
                // timer
                polling = setTimeout(() => {
                    this.DoConnect();
                }, this.intervall_time);
                return;
            }
            else {
                this.log.debug('Internet connection detected. Everything fine!');
            }

            // Check if credentials are not empty
            if (user !== '' && pass !== '') {
                try {
                    await this.DoData_Refresh(user, pass);
                } catch (error) {
                    this.log.error(String(error));
                }
            } else {
                this.log.error('*** Adapter deactivated, credentials missing in Adaptper Settings !!!  ***');
                this.setForeignState('system.adapter.' + this.namespace + '.alive', false);
            }
        }
        catch (error) {
            this.log.error(`Issue at DoConnect(): '${error}'`);
            console.error(`Issue at DoConnect(): '${error}'`);
            this.errorHandling(error);
        }
    }

    /**
     * @param {string} HomeId
     */
    async DoHome(HomeId) {
        // Get additional basic data for all homes
        if (this.home_data === null) {
            this.home_data = await this.getHome(HomeId);
        }
        this.log.debug('Home_data Result: ' + JSON.stringify(this.home_data));
        if (this.home_data.generation == 'LINE_X') {
            this.isTadoX = true;
            this.log.info('TadoX is ' + this.isTadoX);
        }
        else this.isTadoX = false;
        if (this.home_data == null) throw new Error('home_date is null');
        if (!this.isTadoX) this.home_data.masterswitch = '';
        this.DoWriteJsonRespons(HomeId, 'Stage_02_HomeData', this.home_data);
        jsonExplorer.traverseJson(this.home_data, `${HomeId}.Home`, true, true, 0);
    }

    /**
     * @param {string} HomeId
     */
    async DoWeather(HomeId) {
        const weather_data = await this.getWeather(HomeId);
        if (weather_data == null) throw new Error('weather_data is null');
        this.log.debug('Weather_data Result: ' + JSON.stringify(weather_data));
        this.DoWriteJsonRespons(HomeId, 'Stage_04_Weather', weather_data);
        jsonExplorer.traverseJson(weather_data, `${HomeId}.Weather`, true, true, 0);
    }

    /**
     * @param {string} HomeId
     * @param {string} ZoneId
     * @param {string} DeviceId
     * @param {object} offset
     */
    async DoTemperatureOffset(HomeId, ZoneId, DeviceId, offset = null) {
        if (offset == null) {
            offset = await this.getTemperatureOffset(DeviceId);
        }
        this.log.debug(`Offset Result for DeviceID '${DeviceId}': ${JSON.stringify(offset)}`);
        if (offset == null) throw new Error('offset is null');
        this.DoWriteJsonRespons(HomeId, `Stage_12_Offset_${HomeId}`, offset);
        if (offset.celsius != undefined) offset.offsetCelsius = offset.celsius;
        if (offset.fahrenheit != undefined) offset.offsetFahrenheit = offset.fahrenheit;
        delete offset.celsius;
        delete offset.fahrenheit;
        jsonExplorer.traverseJson(offset, `${HomeId}.Rooms.${ZoneId}.devices.${DeviceId}.offset`, true, true, 2);
    }

    async DoMobileDevices(HomeId) {
        this.MobileDevices_data = await this.getMobileDevices(HomeId);
        if (this.MobileDevices_data == null) throw new Error('MobileDevices_data is null');
        this.log.debug('MobileDevices_data Result: ' + JSON.stringify(this.MobileDevices_data));
        this.DoWriteJsonRespons(HomeId, 'Stage_06_MobileDevicesData', this.MobileDevices_data);
        jsonExplorer.traverseJson(this.MobileDevices_data, `${HomeId}.Mobile_Devices`, true, true, 0);
    }

    async DoZones(HomeId) {
        this.Zones_data = await this.getZones(HomeId);
        this.log.debug('Zones_data Result: ' + JSON.stringify(this.Zones_data));
        if (this.Zones_data == null) throw new Error('Zones_data is null');
        this.DoWriteJsonRespons(HomeId, 'Stage_08_ZonesData', this.Zones_data);

        //Search for DeviceIDs to get Offset
        for (const j in this.Zones_data) {
            for (const k in this.Zones_data[j]) {
                for (const l in this.Zones_data[j][k]) {
                    let ZoneId = this.Zones_data[j].id;
                    let DeviceId = this.Zones_data[j][k][l].serialNo;
                    if (DeviceId != undefined) {
                        this.log.debug('DeviceID for offset found: ' + JSON.stringify(this.Zones_data[j][k][l].serialNo));
                        this.Zones_data[j][k][l].id = this.Zones_data[j][k][l].serialNo;
                        if (this.Zones_data[j][k][l].duties.includes(`ZONE_LEADER`)) {
                            await this.DoTemperatureOffset(HomeId, ZoneId, DeviceId);
                        }
                    }
                }
            }
            // Change `enabled` to `openWindowDetectionEnabled`
            this.Zones_data[j].openWindowDetection.openWindowDetectionEnabled = this.Zones_data[j].openWindowDetection.enabled;
            delete this.Zones_data[j].openWindowDetection.enabled;
        }

        jsonExplorer.traverseJson(this.Zones_data, `${HomeId}.Rooms`, true, true, 0);

        for (const i in this.Zones_data) {
            let zoneId = this.Zones_data[i].id;
            await this.DoZoneStates(HomeId, zoneId);
            await this.DoCapabilities(HomeId, zoneId);
            await this.DoAwayConfiguration(HomeId, zoneId);
            await this.DoTimeTables(HomeId, zoneId);
        }
    }

    /**
     * @param {string} HomeId
     * @param {string} ZoneId
     */
    async DoZoneStates(HomeId, ZoneId) {
        let ZonesState_data = await this.getZoneState(HomeId, ZoneId);
        if (ZonesState_data == null) throw new Error('ZonesState_data is null');
        this.log.debug(`ZoneStates_data result for room '${ZoneId}' is ${JSON.stringify(ZonesState_data)}`);
        if (ZonesState_data.setting.temperature == null) {
            ZonesState_data.setting.temperature = {};
            ZonesState_data.setting.temperature.celsius = null;
        }
        this.DoWriteJsonRespons(HomeId, 'Stage_09_ZoneStates_data_' + ZoneId, ZonesState_data);
        ZonesState_data.overlayClearZone = false;
        ZonesState_data.activateOpenWindow = false;
        jsonExplorer.traverseJson(ZonesState_data, HomeId + '.Rooms.' + ZoneId, true, true, 2);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async DoCapabilities(homeId, zoneId) {
        let capabilities_data;
        if (this.roomCapabilities[zoneId]) capabilities_data = this.roomCapabilities[zoneId];
        else capabilities_data = await this.getCapabilities(homeId, zoneId);
        if (capabilities_data == null) throw new Error('capabilities_data is null');
        this.roomCapabilities[zoneId] = capabilities_data;
        this.log.debug(`Capabilities_data result for room '${zoneId}' is ${JSON.stringify(capabilities_data)}`);
        this.DoWriteJsonRespons(homeId, 'Stage_09_Capabilities_data_' + zoneId, capabilities_data);
        jsonExplorer.traverseJson(capabilities_data, homeId + '.Rooms.' + zoneId + '.capabilities', true, true, 2);
    }

    /**
     * @param {string} HomeId
     * @param {string} ZoneId
     * @param {object} TimeTables_data
     */
    async DoTimeTables(HomeId, ZoneId, TimeTables_data = null) {
        if (TimeTables_data == null) {
            TimeTables_data = await this.getTimeTables(HomeId, ZoneId);
        }
        if (TimeTables_data == null) throw new Error('TimeTables_data is null');
        TimeTables_data.tt_id = TimeTables_data.id;
        delete TimeTables_data.id;
        this.log.debug('ZoneOverlay_data Result: ' + JSON.stringify(TimeTables_data));
        this.DoWriteJsonRespons(HomeId, 'Stage_13_TimeTables_' + ZoneId, TimeTables_data);
        this.log.debug('Timetable for room ' + ZoneId + ' is ' + JSON.stringify(TimeTables_data));
        jsonExplorer.traverseJson(TimeTables_data, HomeId + '.Rooms.' + ZoneId + '.timeTables', true, true, 2);
    }

    async DoAwayConfiguration(HomeId, ZoneId) {
        const AwayConfiguration_data = await this.getAwayConfiguration(HomeId, ZoneId);
        if (AwayConfiguration_data == null) throw new Error('AwayConfiguration_data is null');
        this.log.debug('AwayConfiguration_data Result: ' + JSON.stringify(AwayConfiguration_data));
        this.DoWriteJsonRespons(HomeId, 'Stage_10_AwayConfiguration_' + ZoneId, AwayConfiguration_data);
        jsonExplorer.traverseJson(AwayConfiguration_data, HomeId + '.Rooms.' + ZoneId + '.awayConfig', true, true, 2);
    }

    async DoWriteJsonRespons(HomeId, state_name, value) {
        try {
            if (this.log.level == 'debug' || this.log.level == 'silly') {
                this.log.debug('JSON data written for ' + state_name + ' with values: ' + JSON.stringify(value));
                this.log.debug('HomeId ' + HomeId + ' name: ' + state_name + state_name + ' value ' + JSON.stringify(value));

                await this.setObjectNotExistsAsync(HomeId + '._JSON_response', {
                    type: 'device',
                    common: {
                        name: 'Plain JSON data from API',
                    },
                    native: {},
                });
                await this.create_state(HomeId + '._JSON_response.' + state_name, state_name, JSON.stringify(value));
            }
        }
        catch (error) {
            this.log.error(`Issue at DoWriteJsonRespons(): '${error}'`);
            console.error(`Issue at DoWriteJsonRespons(): '${error}'`);
            this.errorHandling(error);
        }
    }

    /**
     * @param {string} HomeId
     * @param {object} homeState_data
     */
    async DoHomeState(HomeId, homeState_data = null) {
        if (homeState_data == null) {
            homeState_data = await this.getHomeState(HomeId);
        }
        if (homeState_data == null) throw new Error('homeState_data is null');
        this.log.debug('HomeState_data Result: ' + JSON.stringify(homeState_data));
        this.DoWriteJsonRespons(HomeId, 'Stage_11_HomeState', homeState_data);
        jsonExplorer.traverseJson(homeState_data, HomeId + '.Home.state', true, true, 1);
    }


    //////////////////////////////////////////////////////////////////////
    /* MASTERSWITCH														*/
    //////////////////////////////////////////////////////////////////////
    /**
     * @param {string} masterswitch
     */
    async setMasterSwitch(masterswitch) {
        masterswitch = masterswitch.toUpperCase();
        if (masterswitch != 'ON' && masterswitch != 'OFF') {
            this.log.error(`Masterswitch value 'ON' or 'OFF' expected but received '${masterswitch}'`);
            return;
        }
        try {
            const states = await this.getStatesAsync('*.Rooms.*.link.state');
            for (const idS in states) {
                let path = idS.split('.');
                let homeId = path[2];
                let zoneId = path[4];
                let powerPath = homeId + '.Rooms.' + zoneId + '.setting.power';
                let overlayClearZonePath = homeId + '.Rooms.' + zoneId + '.overlayClearZone';
                let typeSkillBasedAppPath = homeId + '.Rooms.' + zoneId + '.overlay.termination.typeSkillBasedApp';
                const settingType = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.type');
                if (settingType && settingType.val == 'HEATING') {
                    if (masterswitch == 'ON') {
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
            this.errorHandling(error);
        }
    }

    //////////////////////////////////////////////////////////////////////
    /* MISC																*/
    //////////////////////////////////////////////////////////////////////
    refreshToken() {
        const expires_at = new Date(this.accessToken.token.expires_at);
        const shouldRefresh = expires_at.getTime() - new Date().getTime() < EXPIRATION_WINDOW_IN_SECONDS * 1000 || this.accessToken.token.expires_at == undefined;
        let that = this;
        this.log.info('Lets refresh token ' + shouldRefresh + ' ' + this.accessToken.token.expires_at);

        return new Promise((resolve, reject) => {
            if (shouldRefresh) {
                let uri = `https://login.tado.com/oauth2/token?client_id=1bb50063-6b0c-4d11-bd99-387f4a91cc46&grant_type=refresh_token&refresh_token=${this.accessToken.token.refresh_token}`;
                this.log.info(uri);
                axiosInstanceToken.post(uri, {})
                    .then(async function (responseRaw) {
                        let response = responseRaw.data;
                        that.log.info(JSON.stringify(response));
                        that.accessToken.token.access_token = response.access_token;
                        let expireMS = response.expires_in * 1000 + new Date().getTime();
                        that.log.info(expireMS + '');
                        that.accessToken.token.expires_at = new Date(expireMS);
                        that.accessToken.token.refresh_token = response.refresh_token;
                        that.log.info(JSON.stringify(that.accessToken));
                        await that.updateTokenSetForAdapter(that.accessToken);
                        resolve(that.accessToken);
                    })
                    .catch(error => {
                        reject(error);
                    });
            }
            else resolve(that.accessToken);
        });
    }

    async updateTokenSetForAdapter(tokenSet) {
        this.log.info('Daikin token updated in adapter configuration ...');
        await this.extendObject(`_config`, {
            native: {
                tokenSet
            }
        });
    }

    /*return new Promise((resolve, reject) => {
        if (shouldRefresh) {
            this.accessToken.refresh()
                .then(result => {
                    this.accessToken = result;
                    resolve(this.accessToken);
                })
                .catch(error => {
                    reject(error);
                });
        } else {
            resolve(this.accessToken);
        }
    });*/

    /**
     * @param {string} username
     * @param {string} password
     */
    async login(username, password) {
        this.refreshToken();
        const client = new ResourceOwnerPassword(tado_config);
        const tokenParams = {
            username: username,
            password: password,
            scope: 'home.user',
        };
        try {
            //this.accessToken = await client.getToken(tokenParams); //replaced by code below to manage if getToken() is not replying
            const timeoutFunc = client.getToken(tokenParams);
            const runIt = async () => {
                try {
                    this.accessToken = await asyncCallWithTimeout(timeoutFunc, 10000);
                    this.log.debug('Login successful');
                }
                catch (err) {
                    this.log.error('Error: ' + err);
                    console.error(err);
                    throw (err);
                }
            };
            await runIt();


        } catch {
            throw new Error('Login failed! Please verify Username and Password');
        }
    }

    /**
     * @param {number} msmin
     * @param {number} msmax
     */
    async sleep(msmin, msmax = msmin) {
        let ms = Math.random() * (msmax - msmin) + msmin;
        this.log.debug('Waiting time is ' + ms + 'ms');
        await jsonExplorer.sleep(ms);
        return;
        //return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * @param {string} url
     * @param {string} method
     * @param {any} data
     */
    async apiCall(url, method = 'get', data = null) {
        let promise;
        try {
            const waitingTime = 300;  //time in ms to wait between calls
            // check if other call is in progress and if yes loop and wait
            if (method != 'get' && this.apiCallinExecution == true) {
                for (let i = 0; i < 10; i++) {
                    this.log.debug('Other API call in action, waiting... ' + url);
                    await this.sleep(waitingTime + 300, waitingTime + 400);
                    this.log.debug('Waiting done! ' + url);
                    if (this.apiCallinExecution != true) {
                        this.log.debug('Time to execute ' + url); break;
                    } else {
                        this.log.debug('Oh, no! One more loop! ' + url);
                    }
                }
            }
            if (method != 'get') {
                this.apiCallinExecution = true;
                console.log(`Body "${JSON.stringify(data)}" for API call "${url}"`);
                this.log.debug(`Body "${JSON.stringify(data)}" for API call "${url}"`);
            }
            promise = await new Promise((resolve, reject) => {
                if (this.accessToken) {
                    this.refreshToken().then(() => {
                        axiosInstance({
                            url: url,
                            method: method,
                            data: data,
                            headers: {
                                'Authorization': 'Bearer ' + this.accessToken.token.access_token,
                                'Source': 'iobroker.tado@' + version
                            }
                        }).then(response => {
                            if (method != 'get') {
                                setTimeout(() => { this.apiCallinExecution = false; }, waitingTime);
                            }
                            resolve(response.data);
                        }).catch(error => {
                            if (method != 'get') this.apiCallinExecution = false;
                            if (error.response && error.response.data) {
                                console.error(error + ' with response ' + JSON.stringify(error.response.data));
                                this.log.error(error + ' with response ' + JSON.stringify(error.response.data));
                            }
                            else {
                                console.error(error);
                                this.log.error(error);
                            }
                            reject(error);
                        });
                    }).catch(error => {
                        reject(error);
                    });
                } else {
                    if (method != 'get') this.apiCallinExecution = false;
                    reject(new Error('Not yet logged in'));
                }
            });
        } catch (error) {
            //this.log.error(`Issue at apiCall for ''${method} ${url}': ${error}`);
            console.error(`Issue at apiCall: ${error}`);
            this.errorHandling(error);
            throw new Error((`Issue at apiCall for ''${method} ${url}': ${error}`));
        }
        return promise;
    }

    /**
     * @param {string} state
     * @param {string} name
     * @param {any} value
     */
    async create_state(state, name, value) {
        this.log.debug(`Create_state called for state '${state}' and name '${name}' with value '${value}'`);
        const intervall_time = (this.config.intervall * 4);
        if (value != undefined) {
            jsonExplorer.stateSetCreate(state, name, value, intervall_time);
        }
    }

    /**
     * @param {any} errorObject
     */
    async errorHandling(errorObject) {
        try {
            if (errorObject.message && (errorObject.message.includes('Login failed!') ||
                errorObject.message.includes('conflict occurred while trying to update entity null') ||
                errorObject.message.includes('ECONNRESET') ||
                errorObject.message.includes('socket hang up') ||
                errorObject.message.includes('with status code 504') ||
                errorObject.message.includes('ETIMEDOUT') ||
                errorObject.message.includes('EAI_AGAIN') ||
                errorObject.message.includes('timeout of 20000ms exceeded') ||
                errorObject.message.includes('No internet connection detected!'))) return;
            if (this.log.level != 'debug' && this.log.level != 'silly') {
                if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
                    const sentryInstance = this.getPluginInstance('sentry');
                    if (sentryInstance) {
                        sentryInstance.getSentryObject().captureException(errorObject);
                    }
                }
            }
        } catch (error) {
            console.log(error);
        }
    }

    async sendSentryWarn(message) {
        try {
            if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
                const sentryInstance = this.getPluginInstance('sentry');
                if (sentryInstance) {
                    const Sentry = sentryInstance.getSentryObject();
                    Sentry && Sentry.withScope(scope => {
                        scope.setLevel(Sentry.Severity.Warning);
                        Sentry.captureMessage(message);
                    });
                }
            }
        } catch (error) {
            console.log(error);
        }
    }

    async resetTimer() {
        const states = await this.getStatesAsync('*.Rooms.*.link');
        for (const idS in states) {
            let deviceId = idS.split('.');
            let pooltimerid = deviceId[2] + deviceId[4];
            this.log.debug(`Check if timer ${pooltimerid} to be cleared.`);
            if (pooltimer[pooltimerid]) {
                clearTimeout(pooltimer[pooltimerid]);
                pooltimer[pooltimerid] = null;
                this.log.debug(`Timer ${pooltimerid} cleared.`);
            }
        }
        if (polling) {
            clearTimeout(polling);
            polling = null;
            this.log.debug(`Polling-Timer cleared.`);
        }
    }


    //////////////////////////////////////////////////////////////////////
    /* GET METHODS														*/
    //////////////////////////////////////////////////////////////////////
    async getMe() {
        return await this.apiCall('/api/v2/me');
    }

    // Read account information and all home related data
    /**
     * @param {string} homeId
     */
    async getHome(homeId) {
        return this.apiCall(`/api/v2/homes/${homeId}`);
    }

    // Get weather information for home location
    async getWeather(homeId) {
        return await this.apiCall(`/api/v2/homes/${homeId}/weather`);
    }

    /**
     * @param {string} homeId
     */
    async getMobileDevices(homeId) {
        return await this.apiCall(`/api/v2/homes/${homeId}/mobileDevices`);
    }

    /**
     * @param {string} homeId
     */
    async getZones(homeId) {
        return await this.apiCall(`/api/v2/homes/${homeId}/zones`);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async getZoneState(homeId, zoneId) {
        return await this.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/state`);
    }

    /**
    * @param {string} homeId
    * @param {string} zoneId
    */
    async getCapabilities(homeId, zoneId) {
        return await this.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/capabilities`);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async getAwayConfiguration(homeId, zoneId) {
        return await this.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/awayConfiguration`);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async getTimeTables(homeId, zoneId) {
        return await this.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/schedule/activeTimetable`);
    }

    /**
     * @param {string} deviceId
     */
    async getTemperatureOffset(deviceId) {
        return await this.apiCall(`/api/v2/devices/${deviceId}/temperatureOffset`);
    }

    /**
     * @param {string} homeId
     */
    async getHomeState(homeId) {
        return await this.apiCall(`/api/v2/homes/${homeId}/state`);
    }

    /**
     * @param {string} homeId
     */
    async getRoomsTadoX(homeId) {
        return this.apiCall(`${tadoX_url}/homes/${homeId}/rooms`);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async getroomsAndDevicesTadoX(homeId, zoneId) {
        return this.apiCall(`${tadoX_url}/homes/${homeId}/rooms/${zoneId}`);
    }

    /**
     * @param {string} homeId
     */
    async getRoomsAndDevicesTadoX(homeId) {
        return this.apiCall(`${tadoX_url}/homes/${homeId}/roomsAndDevices`);
    }
}

/**
 * @param {string | number | boolean} valueToBoolean
 */
function toBoolean(valueToBoolean) {
    return (valueToBoolean === true || valueToBoolean === 'true');
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Tado(options);
} else {
    // otherwise start the instance directly
    new Tado();
}

const asyncCallWithTimeout = async (asyncPromise, timeLimit) => {
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
};