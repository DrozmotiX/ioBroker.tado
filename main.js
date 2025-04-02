'use strict';

const utils = require('@iobroker/adapter-core');
const EXPIRATION_WINDOW_IN_SECONDS = 10;

const tado_url = 'https://my.tado.com';
const tado_app_url = `https://app.tado.com/`;
const tadoX_url = `https://hops.tado.com`;
const client_id = `1bb50063-6b0c-4d11-bd99-387f4a91cc46`;
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

// @ts-ignore
const axiosInstanceToken = axios.create({
    baseURL: `https://login.tado.com/oauth2`
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
        this.uri4token = '';
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        jsonExplorer.sendVersionInfo(version);
        this.log.info('Started with JSON-Explorer version ' + jsonExplorer.version);
        this.intervall_time = Math.max(30, this.config.intervall) * 1000;

        const tokenObject = await this.getObjectAsync('_config');
        this.debugLog('tokenObject from config is' + JSON.stringify(tokenObject));
        this.accessToken = tokenObject && tokenObject.native && tokenObject.native.tokenSet ? tokenObject.native.tokenSet : null;
        this.debugLog('accessToken is ' + JSON.stringify(this.accessToken));
        if (this.accessToken == null) {
            this.accessToken = {};
            this.accessToken.token = {};
            this.accessToken.token.refresh_token = '';
        }
        await jsonExplorer.stateSetCreate('info.connection', 'connection', false);
        await this.DoConnect();
    }

    async onMessage(msg) {
        try {
            if (typeof msg === 'object' && msg.command) {
                switch (msg.command) {
                    case 'auth1': {
                        this.debugLog(`Received t_o_k_e_n creation Step 1 message`);
                        let that = this;
                        axiosInstanceToken.post(`/device_authorize?client_id=${client_id}&scope=offline_access`, {})
                            .then(function (responseRaw) {
                                let response = responseRaw.data;
                                that.log.debug('Response t_o_k_e_n Step 1 is ' + JSON.stringify(response));
                                that.device_code = response.device_code;
                                that.uri4token = response.verification_uri_complete;
                                msg.callback && that.sendTo(msg.from, msg.command, { error: `Copy address in your browser and proceed ${that.uri4token}` }, msg.callback);
                                that.debugLog('t_o_k_e_n Step 1 done');
                            })
                            .catch(error => {
                                this.log.error('Error at token creation Step 1 ' + error);
                                console.error('Error at t_o_k_e_n creation Step 1 ' + error);
                                if (error.response && error.response.data) {
                                    console.error(error + ' with response ' + JSON.stringify(error.response.data));
                                    this.log.error(error + ' with response ' + JSON.stringify(error.response.data));
                                }
                                this.errorHandling('CreateT Step1 failed: ' + error);
                            });
                        break;
                    }
                    case 'auth2': {
                        this.debugLog(`Received t_o_k_e_n step 2 message`);
                        let that = this;
                        if (!this.device_code) {
                            this.log.error('Step 1 was not executed, but step 2 startet! Please start/restart with Step 1.');
                            break;
                        }
                        const uri = `/token?client_id=${client_id}&device_code=${this.device_code}&grant_type=urn:ietf:params:oauth:grant-type:device_code`;
                        this.debugLog('t_o_k_e_n Step 2 Url is ' + uri);
                        axiosInstanceToken.post(uri, {})
                            .then(async function (responseRaw) {
                                that.debugLog('Response t_o_k_e_n Step 2 is ' + JSON.stringify(responseRaw.data));
                                await that.manageNewToken(responseRaw.data);
                                msg.callback && that.sendTo(msg.from, msg.command, { error: `Done! Adapter starts now...` }, msg.callback);
                                that.debugLog('t_o_k_e_n Step 2 done');
                                await that.DoConnect();
                            })
                            .catch(error => {
                                this.log.error('Error at token creation Step 2 ' + error);
                                console.error('Error at t_o_k_e_n creation Step 2 ' + error);
                                if (error.response && error.response.data) {
                                    let message = JSON.stringify(error.response.data);
                                    if (message.includes('authorization_pending')) {
                                        this.log.error(`Step 1 not completed. Open link '${that.uri4token}' in your browser and follow described steps on webpage`);
                                        return;
                                    } else {
                                        console.error(error + ' with response ' + JSON.stringify(error.response.data));
                                        this.log.error(error + ' with response ' + JSON.stringify(error.response.data));
                                    }
                                }
                                this.errorHandling('CreateT Step2 failed: ' + error);
                            });
                        break;
                    }
                }
            }
        } catch (error) {
            this.log.error(`Issue at token process: ${error}`);
            this.errorHandling(error);
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
        this.debugLog(id + ' changed');
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

        this.debugLog('boostMode is: ' + set_boostMode);
        this.debugLog('Power is: ' + set_power);
        this.debugLog(`Temperature is: ${set_temp}`);
        this.debugLog('Termination mode is: ' + set_terminationMode);
        this.debugLog('RemainingTimeInSeconds is: ' + set_remainingTimeInSeconds);
        this.debugLog('NextTimeBlockStart exists: ' + set_NextTimeBlockStartExists);
        this.debugLog('DevicId is: ' + deviceId);

        switch (statename) {
            case ('power'):
                if (set_terminationMode == 'NO_OVERLAY') {
                    if (set_power == 'ON') {
                        this.debugLog(`Overlay cleared for room '${roomId}' in home '${homeId}'`);
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
                    }
                    else if (statename == 'offsetCelsius') {
                        const offset = state;
                        let set_offset = (offset == null || offset == undefined || offset.val == null) ? 0 : parseFloat(offset.val.toString());
                        this.debugLog(`Offset changed for device '${deviceId}' in home '${homeId}' to value '${set_offset}'`);
                        this.setTemperatureOffset(homeId, zoneId, deviceId, set_offset);
                    } else if (statename == 'childLockEnabled') {
                        const childLockEnabled = state;
                        let set_childLockEnabled = (childLockEnabled == null || childLockEnabled == undefined || childLockEnabled.val == null || childLockEnabled.val == '') ? false : toBoolean(childLockEnabled.val);
                        this.debugLog(`ChildLockEnabled changed for device '${deviceId}' in home '${homeId}' to value '${set_childLockEnabled}'`);
                        this.setChildLock(homeId, zoneId, deviceId, set_childLockEnabled);
                    } else if (statename == 'tt_id') {
                        const tt_id = state;
                        let set_tt_id = (tt_id == null || tt_id == undefined || tt_id.val == null || tt_id.val == '') ? 0 : parseInt(tt_id.val.toString());
                        this.debugLog(`TimeTable changed for room '${zoneId}' in home '${homeId}' to value '${set_tt_id}'`);
                        this.setActiveTimeTable(homeId, zoneId, set_tt_id);
                    } else if (statename == 'presence') {
                        const presence = state;
                        let set_presence = (presence == null || presence == undefined || presence.val == null || presence.val == '') ? 'HOME' : presence.val.toString().toUpperCase();
                        this.debugLog(`Presence changed in home '${homeId}' to value '${set_presence}'`);
                        this.setPresenceLock(homeId, set_presence);
                    } else if (statename == 'masterswitch') {
                        const masterswitch = state;
                        let set_masterswitch = (masterswitch == null || masterswitch == undefined || masterswitch.val == null || masterswitch.val == '') ? 'unknown' : masterswitch.val.toString().toUpperCase();
                        this.debugLog(`Masterswitch changed in home '${homeId}' to value '${set_masterswitch}'`);
                        await this.setMasterSwitch(set_masterswitch);
                        await this.sleep(1000);
                        await this.setState(`${homeId}.Home.masterswitch`, '', true);
                    } else if (statename == 'activateOpenWindow') {
                        this.debugLog(`Activate Open Window for room '${zoneId}' in home '${homeId}'`);
                        await this.setActivateOpenWindow(homeId, zoneId);
                    } else if (idSplitted[idSplitted.length - 2] === 'openWindowDetection' && (statename == 'openWindowDetectionEnabled' || statename == 'timeoutInSeconds')) {
                        const openWindowDetectionEnabled = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.openWindowDetection.openWindowDetectionEnabled');
                        const openWindowDetectionTimeoutInSeconds = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.openWindowDetection.timeoutInSeconds');
                        let set_openWindowDetectionEnabled = (openWindowDetectionEnabled == null || openWindowDetectionEnabled == undefined || openWindowDetectionEnabled.val == null || openWindowDetectionEnabled.val == '') ? false : toBoolean(openWindowDetectionEnabled.val);
                        let set_openWindowDetectionTimeoutInSeconds = (openWindowDetectionTimeoutInSeconds == null || openWindowDetectionTimeoutInSeconds == undefined || openWindowDetectionTimeoutInSeconds.val == null || openWindowDetectionTimeoutInSeconds.val == '') ? 900 : Number(openWindowDetectionTimeoutInSeconds.val);

                        this.debugLog('Open Window Detection enabled: ' + set_openWindowDetectionEnabled);
                        this.debugLog('Open Window Detection Timeout is: ' + set_openWindowDetectionTimeoutInSeconds);

                        this.debugLog(`Changing open window detection for '${zoneId}' in home '${homeId}'`);
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
                        this.debugLog('Type is: ' + set_type);
                        this.debugLog('Power is: ' + set_power);
                        this.debugLog(`Temperature is: ${set_temp}`);
                        this.debugLog('Execution mode (typeSkillBasedApp) is: ' + set_mode);
                        this.debugLog('DurationInSeconds is: ' + set_durationInSeconds);
                        this.debugLog('NextTimeBlockStart exists: ' + set_NextTimeBlockStartExists);
                        this.debugLog('Mode is: ' + set_acMode);
                        this.debugLog('FanSpeed is: ' + set_fanSpeed);
                        this.debugLog('FanLevel is: ' + set_fanLevel);
                        this.debugLog('HorizontalSwing is: ' + set_horizontalSwing);
                        this.debugLog('VerticalSwing is: ' + set_verticalSwing);
                        this.debugLog('Swing is: ' + set_swing);
                        this.debugLog('Light is: ' + set_light);

                        switch (statename) {
                            case ('overlayClearZone'):
                                this.debugLog(`Overlay cleared for room '${zoneId}' in home '${homeId}'`);
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
                                this.debugLog(`Temperature changed for room '${zoneId}' in home '${homeId}' to '${set_temp}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('durationInSeconds'):
                                set_mode = 'TIMER';
                                this.debugLog(`DurationInSecond changed for room '${zoneId}' in home '${homeId}' to '${set_durationInSeconds}'`);
                                await this.setState(`${homeId}.Rooms.${zoneId}.overlay.termination.typeSkillBasedApp`, set_mode, true);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('fanSpeed'):
                                this.debugLog(`FanSpeed changed for room '${zoneId}' in home '${homeId}' to '${set_fanSpeed}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('mode'):
                                this.debugLog(`Mode changed for room '${zoneId}' in home '${homeId}' to '${set_acMode}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('fanLevel'):
                                this.debugLog(`fanLevel changed for room '${zoneId}' in home '${homeId}' to '${set_fanLevel}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('swing'):
                                this.debugLog(`swing changed for room '${zoneId}' in home '${homeId}' to '${set_swing}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('light'):
                                this.debugLog(`light changed for room '${zoneId}' in home '${homeId}' to '${set_light}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('horizontalSwing'):
                                this.debugLog(`horizontalSwing changed for room '${zoneId}' in home '${homeId}' to '${set_horizontalSwing}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('verticalSwing'):
                                this.debugLog(`verticalSwing changed for room '${zoneId}' in home '${homeId}' to '${set_verticalSwing}'`);
                                await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                break;

                            case ('typeSkillBasedApp'):
                                if (set_mode == 'NO_OVERLAY') { break; }
                                this.debugLog(`TypeSkillBasedApp changed for room '${zoneId}' in home '${homeId}' to '${set_mode}'`);
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
                                        this.debugLog(`Overlay cleared for room '${zoneId}' in home '${homeId}'`);
                                        await this.setClearZoneOverlay(homeId, zoneId);
                                    }
                                    else {
                                        set_mode = 'MANUAL';
                                        this.debugLog(`Power changed for room '${zoneId}' in home '${homeId}' to '${state.val}' and temperature '${set_temp}' and mode '${set_mode}'`);
                                        await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                    }
                                } else {
                                    this.debugLog(`Power changed for room '${zoneId}' in home '${homeId}' to '${state.val}' and temperature '${set_temp}' and mode '${set_mode}'`);
                                    await this.setZoneOverlay(homeId, zoneId, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed, set_swing, set_light);
                                }
                                break;

                            default:
                        }
                    }
                    this.debugLog('State change detected from different source than adapter');
                    this.debugLog(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                } catch (error) {
                    this.log.error(`Issue at state change: ${error}`);
                    console.error(`Issue at state change: ${error}`);
                    this.errorHandling(error);
                }

            } else {
                this.oldStatesVal[id] = state.val;
                //this.debugLog(`Changed value ${state.val} for ID ${id} stored`);
                //this.debugLog(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            }
        } else {
            // The state was deleted
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

        this.debugLog('setManualControlTadoX() payload is ' + JSON.stringify(payload));
        let apiResponse = await this.apiCall(`${tadoX_url}/homes/${homeId}/rooms/${roomId}/manualControl`, 'post', payload);
        this.debugLog('setManualControlTadoX() response is ' + JSON.stringify(apiResponse));
        await this.DoRoomsStateTadoX(homeId, roomId);
    }

    /**
     * @param {string} homeId
     * @param {string} roomId
     */
    async setResumeRoomScheduleTadoX(homeId, roomId) {
        let apiResponse = await this.apiCall(`${tadoX_url}/homes/${homeId}/rooms/${roomId}/resumeSchedule`, 'post');
        this.debugLog('setResumeRoomScheduleTadoX() response is ' + JSON.stringify(apiResponse));
        await this.DoRoomsStateTadoX(homeId, roomId);
    }

    /**
     * @param {string} homeId
     */
    async setResumeHomeScheduleTadoX(homeId) {
        let apiResponse = await this.apiCall(`${tadoX_url}/homes/${homeId}/quickActions/resumeSchedule`, 'post');
        this.debugLog('setResumeHomeScheduleTadoX() response is ' + JSON.stringify(apiResponse));
        await this.DoRoomsTadoX(homeId);
    }

    /**
     * @param {string} homeId
     */
    async setBoostTadoX(homeId) {
        let apiResponse = await this.apiCall(`${tadoX_url}/homes/${homeId}/quickActions/boost`, 'post');
        this.debugLog('setBoostTadoX() response is ' + JSON.stringify(apiResponse));
        await this.DoRoomsTadoX(homeId);
    }

    /**
     * @param {string} homeId
     */
    async setAllOffTadoX(homeId) {
        let apiResponse = await this.apiCall(`${tadoX_url}/homes/${homeId}/quickActions/allOff`, 'post');
        this.debugLog('setAllOffTadoX() response is ' + JSON.stringify(apiResponse));
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
            this.debugLog(`Called 'DELETE ${url}'`);
            await jsonExplorer.setLastStartTime();
            await this.DoZoneStates(homeId, zoneId);
            this.debugLog('CheckExpire() at clearZoneOverlay() started');
            await jsonExplorer.checkExpire(homeId + '.Rooms.' + zoneId + '.overlay.*');
        }
        catch (error) {
            this.log.error(`Issue at clearZoneOverlay(): '${error}'`);
            console.error(`Issue at clearZoneOverlay(): '${error}'`);
            this.errorHandling(`'${error}' at clearZoneOverlay()`);
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
            this.debugLog(`API 'temperatureOffset' for home '${homeId}' and deviceID '${deviceId}' with body ${JSON.stringify(offset)} called.`);
            this.debugLog(`Response from 'temperatureOffset' is ${JSON.stringify(apiResponse)}`);
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
        this.debugLog('setActiveTimeTable JSON ' + JSON.stringify(timeTable));
        //this.log.info(`Call API 'activeTimetable' for home '${homeId}' and zone '${zoneId}' with body ${JSON.stringify(timeTable)}`);
        try {
            if (await isOnline() == false) {
                throw new Error('No internet connection detected!');
            }
            apiResponse = await this.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/schedule/activeTimetable`, 'put', timeTable);

            if (apiResponse) await this.DoTimeTables(homeId, zoneId, apiResponse);
            this.debugLog(`API 'activeTimetable' for home '${homeId}' and zone '${zoneId}' with body ${JSON.stringify(timeTable)} called.`);
            this.debugLog(`Response from 'setActiveTimeTable' is ${JSON.stringify(apiResponse)}`);
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
        this.debugLog('homePresence JSON ' + JSON.stringify(homeState));
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
            this.debugLog(`API 'state' for home '${homeId}' with body ${JSON.stringify(homeState)} called.`);
            this.debugLog(`Response from 'presenceLock' is ${JSON.stringify(apiResponse)}`);
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
            this.debugLog(`API 'ZoneOverlay' for home '${homeId}' and zone '${zoneId}' with body ${JSON.stringify(config)} called.`);

            if (result == null) throw new Error('Result of setZoneOverlay is null');

            if (result.setting.temperature == null) {
                result.setting.temperature = {};
                result.setting.temperature.celsius = null;
                result.setting.temperature.fahrenheit = null;
            }
            await jsonExplorer.setLastStartTime();
            await jsonExplorer.traverseJson(result, homeId + '.Rooms.' + zoneId + '.overlay', true, true, 2);
            await jsonExplorer.traverseJson(result.setting, homeId + '.Rooms.' + zoneId + '.setting', true, true, 2);
            this.debugLog('CheckExpire() at setZoneOverlay() started');
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
        this.debugLog(`poolApiCall() entered for '${homeId}/${zoneId}'`);
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
                that.log.debug(`750ms queuing done [timer:'${pooltimerid}']. API will be called.`);
                await that.apiCall(`/api/v2/homes/${homeId}/zones/${zoneId}/overlay`, 'put', config, 'setZoneOverlayPool').then(apiResponse => {
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
            this.debugLog(`Called 'POST ${url}'`);
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
            this.debugLog('setReading executed with result ' + JSON.stringify(result));
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
    /**
     * @param {string} homeId
     */
    async DoRoomsTadoX(homeId) {
        let rooms = await this.getRoomsTadoX(homeId);
        let roomsAndDevices = await this.getRoomsAndDevicesTadoX(homeId);
        this.debugLog('Rooms object is ' + JSON.stringify(rooms));
        this.debugLog('RoomsAndDevices object is ' + JSON.stringify(roomsAndDevices));
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
        this.debugLog('Modified rooms object is' + JSON.stringify(rooms));
        await jsonExplorer.traverseJson(rooms, `${homeId}.Rooms`, true, true, 0);

        for (const i in roomsAndDevices.rooms) {
            let roomId = roomsAndDevices.rooms[i].roomId;
            //loop devices
            for (const j in roomsAndDevices.rooms[i].devices) {
                roomsAndDevices.rooms[i].devices[j].id = roomsAndDevices.rooms[i].devices[j].serialNumber;
            }
            this.debugLog('Devices looks like ' + JSON.stringify(roomsAndDevices.rooms[i].devices));
            await jsonExplorer.traverseJson(roomsAndDevices.rooms[i].devices, `${homeId}.Rooms.${roomsAndDevices.rooms[i].roomId}.devices`, true, true, 1);
            await this.DoRoomsStateTadoX(homeId, roomId);
        }
    }

    /**
     * @param {string} homeId
     * @param {string} roomId
     */
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
        this.debugLog('Modified RoomsAndDevices object is ' + JSON.stringify(roomsAndDevices));
        await jsonExplorer.traverseJson(roomsAndDevices, `${homeId}.Rooms.${roomId}`, true, true, 0);
    }

    async DoData_Refresh() {
        let now = new Date().getTime();
        let step = 'start';
        let outdated = now - this.lastupdate > ONEHOUR;
        let conn_state = await this.getStateAsync('info.connection');
        if (conn_state) this.debugLog('info.connection is ' + conn_state.val);

        try {
            // Get Basic data needed for all other querys and store to global variable
            step = 'getMe_data';
            if (this.getMe_data === null) {
                this.getMe_data = await this.getMe();
            }
            this.debugLog('GetMe result: ' + JSON.stringify(this.getMe_data));
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
                    this.debugLog('Full refresh, data outdated (more than 60 minutes ago)');
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
                    this.debugLog(`CheckExpire() at DoDataRefresh() scenario 'outdated' started`);
                    await jsonExplorer.checkExpire(homeId + '.*');
                } else {
                    this.debugLog(`CheckExpire() at DoDataRefresh() scenario 'not outdated' started`);
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
                this.debugLog('Internet connection detected. Everything fine!');
            }

            if (!this.accessToken.token.refresh_token) {
                this.log.error(`Adapter not running! No token configured. Go to adapter's config page and execute Step 1 and Step 2`);
                return;
            }
            await this.DoData_Refresh();
        }
        catch (error) {
            this.log.error(`Issue at DoConnect(): ${error}`);
            console.error(`Issue at DoConnect(): ${error}`);
            this.errorHandling(error);
        }
    }

    /**
     * @param {string} homeId
     */
    async DoHome(homeId) {
        // Get additional basic data for all homes
        if (this.home_data === null) {
            this.home_data = await this.getHome(homeId);
        }
        this.debugLog('Home_data Result: ' + JSON.stringify(this.home_data));
        if (this.home_data.generation == 'LINE_X') {
            this.isTadoX = true;
            this.log.info('TadoX is ' + this.isTadoX);
        }
        else this.isTadoX = false;
        if (this.home_data == null) throw new Error('home_date is null');
        if (!this.isTadoX) this.home_data.masterswitch = '';
        this.DoWriteJsonRespons(homeId, 'Stage_02_HomeData', this.home_data);
        jsonExplorer.traverseJson(this.home_data, `${homeId}.Home`, true, true, 0);
    }

    /**
     * @param {string} homeId
     */
    async DoWeather(homeId) {
        const weather_data = await this.getWeather(homeId);
        if (weather_data == null) throw new Error('weather_data is null');
        this.debugLog('Weather_data Result: ' + JSON.stringify(weather_data));
        this.DoWriteJsonRespons(homeId, 'Stage_04_Weather', weather_data);
        jsonExplorer.traverseJson(weather_data, `${homeId}.Weather`, true, true, 0);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {string} deviceId
     * @param {object} offset
     */
    async DoTemperatureOffset(homeId, zoneId, deviceId, offset = null) {
        if (offset == null) {
            offset = await this.getTemperatureOffset(deviceId);
        }
        this.debugLog(`Offset Result for DeviceID '${deviceId}': ${JSON.stringify(offset)}`);
        if (offset == null) throw new Error('offset is null');
        this.DoWriteJsonRespons(homeId, `Stage_12_Offset_${homeId}`, offset);
        if (offset.celsius != undefined) offset.offsetCelsius = offset.celsius;
        if (offset.fahrenheit != undefined) offset.offsetFahrenheit = offset.fahrenheit;
        delete offset.celsius;
        delete offset.fahrenheit;
        jsonExplorer.traverseJson(offset, `${homeId}.Rooms.${zoneId}.devices.${deviceId}.offset`, true, true, 2);
    }

    /**
     * @param {string} homeId
     */
    async DoMobileDevices(homeId) {
        this.MobileDevices_data = await this.getMobileDevices(homeId);
        if (this.MobileDevices_data == null) throw new Error('MobileDevices_data is null');
        this.debugLog('MobileDevices_data Result: ' + JSON.stringify(this.MobileDevices_data));
        this.DoWriteJsonRespons(homeId, 'Stage_06_MobileDevicesData', this.MobileDevices_data);
        jsonExplorer.traverseJson(this.MobileDevices_data, `${homeId}.Mobile_Devices`, true, true, 0);
    }

    /**
     * @param {string} homeId
     */
    async DoZones(homeId) {
        let zones_data = await this.getZones(homeId);
        this.debugLog('Zones_data Result: ' + JSON.stringify(zones_data));
        if (zones_data == null) throw new Error('Zones_data is null');
        this.DoWriteJsonRespons(homeId, 'Stage_08_ZonesData', zones_data);

        //Search for DeviceIDs to get Offset
        for (const j in zones_data) {
            for (const k in zones_data[j]) {
                for (const l in zones_data[j][k]) {
                    let zoneId = zones_data[j].id;
                    let deviceId = zones_data[j][k][l].serialNo;
                    if (deviceId != undefined) {
                        this.debugLog('DeviceID for offset found: ' + JSON.stringify(zones_data[j][k][l].serialNo));
                        zones_data[j][k][l].id = zones_data[j][k][l].serialNo;
                        if (zones_data[j][k][l].duties.includes(`ZONE_LEADER`)) {
                            await this.DoTemperatureOffset(homeId, zoneId, deviceId);
                        }
                    }
                }
            }
            // Change `enabled` to `openWindowDetectionEnabled`
            zones_data[j].openWindowDetection.openWindowDetectionEnabled = zones_data[j].openWindowDetection.enabled;
            delete zones_data[j].openWindowDetection.enabled;
        }

        jsonExplorer.traverseJson(zones_data, `${homeId}.Rooms`, true, true, 0);

        for (const i in zones_data) {
            let zoneId = zones_data[i].id;
            await this.DoZoneStates(homeId, zoneId);
            await this.DoCapabilities(homeId, zoneId);
            await this.DoAwayConfiguration(homeId, zoneId);
            await this.DoTimeTables(homeId, zoneId);
        }
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async DoZoneStates(homeId, zoneId) {
        let ZonesState_data = await this.getZoneState(homeId, zoneId);
        if (ZonesState_data == null) throw new Error('ZonesState_data is null');
        this.debugLog(`ZoneStates_data result for room '${zoneId}' is ${JSON.stringify(ZonesState_data)}`);
        if (ZonesState_data.setting.temperature == null) {
            ZonesState_data.setting.temperature = {};
            ZonesState_data.setting.temperature.celsius = null;
        }
        this.DoWriteJsonRespons(homeId, 'Stage_09_ZoneStates_data_' + zoneId, ZonesState_data);
        ZonesState_data.overlayClearZone = false;
        ZonesState_data.activateOpenWindow = false;
        jsonExplorer.traverseJson(ZonesState_data, homeId + '.Rooms.' + zoneId, true, true, 2);
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
        this.debugLog(`Capabilities_data result for room '${zoneId}' is ${JSON.stringify(capabilities_data)}`);
        this.DoWriteJsonRespons(homeId, 'Stage_09_Capabilities_data_' + zoneId, capabilities_data);
        jsonExplorer.traverseJson(capabilities_data, homeId + '.Rooms.' + zoneId + '.capabilities', true, true, 2);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     * @param {object} timeTablesData
     */
    async DoTimeTables(homeId, zoneId, timeTablesData = null) {
        if (timeTablesData == null) {
            timeTablesData = await this.getTimeTables(homeId, zoneId);
        }
        if (timeTablesData == null) throw new Error('TimeTables_data is null');
        timeTablesData.tt_id = timeTablesData.id;
        delete timeTablesData.id;
        this.debugLog('ZoneOverlay_data Result: ' + JSON.stringify(timeTablesData));
        this.DoWriteJsonRespons(homeId, 'Stage_13_TimeTables_' + zoneId, timeTablesData);
        this.debugLog('Timetable for room ' + zoneId + ' is ' + JSON.stringify(timeTablesData));
        jsonExplorer.traverseJson(timeTablesData, homeId + '.Rooms.' + zoneId + '.timeTables', true, true, 2);
    }

    /**
     * @param {string} homeId
     * @param {string} zoneId
     */
    async DoAwayConfiguration(homeId, zoneId) {
        const AwayConfiguration_data = await this.getAwayConfiguration(homeId, zoneId);
        if (AwayConfiguration_data == null) throw new Error('AwayConfiguration_data is null');
        this.debugLog('AwayConfiguration_data Result: ' + JSON.stringify(AwayConfiguration_data));
        this.DoWriteJsonRespons(homeId, 'Stage_10_AwayConfiguration_' + zoneId, AwayConfiguration_data);
        jsonExplorer.traverseJson(AwayConfiguration_data, homeId + '.Rooms.' + zoneId + '.awayConfig', true, true, 2);
    }

    /**
     * @param {string} homeId
     * @param {string} state_name
     * @param {any} value
     */
    async DoWriteJsonRespons(homeId, state_name, value) {
        try {
            if (this.log.level == 'debug' || this.log.level == 'silly') {
                this.debugLog('JSON data written for ' + state_name + ' with values: ' + JSON.stringify(value));
                this.debugLog('HomeId ' + homeId + ' name: ' + state_name + state_name + ' value ' + JSON.stringify(value));

                await this.setObjectNotExistsAsync(homeId + '._JSON_response', {
                    type: 'device',
                    common: {
                        name: 'Plain JSON data from API',
                    },
                    native: {},
                });
                await this.create_state(homeId + '._JSON_response.' + state_name, state_name, JSON.stringify(value));
            }
        }
        catch (error) {
            this.log.error(`Issue at DoWriteJsonRespons(): '${error}'`);
            console.error(`Issue at DoWriteJsonRespons(): '${error}'`);
            this.errorHandling(error);
        }
    }

    /**
     * @param {string} homeId
     * @param {object} homeStateData
     */
    async DoHomeState(homeId, homeStateData = null) {
        if (homeStateData == null) {
            homeStateData = await this.getHomeState(homeId);
        }
        if (homeStateData == null) throw new Error('homeState_data is null');
        this.debugLog('HomeState_data Result: ' + JSON.stringify(homeStateData));
        this.DoWriteJsonRespons(homeId, 'Stage_11_HomeState', homeStateData);
        jsonExplorer.traverseJson(homeStateData, homeId + '.Home.state', true, true, 1);
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
                let powerPath = homeId + '.Rooms.' + zoneId + '.setting.power';
                let overlayClearZonePath = homeId + '.Rooms.' + zoneId + '.overlayClearZone';
                let typeSkillBasedAppPath = homeId + '.Rooms.' + zoneId + '.overlay.termination.typeSkillBasedApp';
                const settingType = await this.getStateAsync(homeId + '.Rooms.' + zoneId + '.setting.type');
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
            this.errorHandling(error);
        }
    }

    //////////////////////////////////////////////////////////////////////
    /* TOKEN MANAGEMENT													*/
    //////////////////////////////////////////////////////////////////////
    refreshToken() {
        const expires_at = new Date(this.accessToken.token.expires_at);
        const shouldRefresh = expires_at.getTime() - new Date().getTime() < EXPIRATION_WINDOW_IN_SECONDS * 1000 || this.accessToken.token.expires_at == undefined;
        let that = this;
        this.debugLog('Need to refresh t_o_k_e_n is ' + shouldRefresh + '  as expire time is ' + expires_at);

        return new Promise((resolve, reject) => {
            if (shouldRefresh) {
                this.debugLog('RefreshT started');
                let uri = `/token?client_id=${client_id}&grant_type=refresh_token&refresh_token=${this.accessToken.token.refresh_token}`;
                this.log.debug(`Uri for refresh token is ${uri}`);
                axiosInstanceToken.post(uri, {})
                    .then(async function (responseRaw) {
                        let result = await that.manageNewToken(responseRaw.data);
                        that.debugLog('RefreshT done');
                        resolve(result);
                    })
                    .catch(error => {
                        if (error.response && error.response.data) {
                            console.error(error + ' with response ' + JSON.stringify(error.response.data));
                            this.log.error(error + ' with response ' + JSON.stringify(error.response.data));
                        }
                        reject(error);
                    });
            }
            else resolve(that.accessToken);
        });
    }

    /**
     * @param {{ access_token: any; expires_in: number; refresh_token: any; }} responseData
     */
    async manageNewToken(responseData) {
        this.log.debug('Response data from refresh t_o_k_e_n is ' + JSON.stringify(responseData));
        this.debugLog('ManageT startet');
        this.accessToken.token.access_token = responseData.access_token;
        let expires_atMs = responseData.expires_in * 1000 + new Date().getTime();
        this.accessToken.token.expires_at = new Date(expires_atMs);
        this.accessToken.token.refresh_token = responseData.refresh_token;
        this.log.debug('New accessT is ' + JSON.stringify(this.accessToken));
        await this.updateTokenSetForAdapter(this.accessToken);
        this.debugLog('ManageT done');
        return (this.accessToken);
    }

    /**
     * @param {any} tokenSet
     */
    async updateTokenSetForAdapter(tokenSet) {
        await this.extendObject(`_config`, {
            native: {
                tokenSet
            }
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
        this.debugLog('Waiting time is ' + ms + 'ms');
        await jsonExplorer.sleep(ms);
        return;
    }

    /**
     * @param {string} url
     * @param {string} method
     * @param {any} payload
     * @param {string} caller
     */
    async apiCall(url, method = 'get', payload = null, caller = '') {
        const stack = new Error().stack;
        if (stack && !caller) {
            let stackParts = stack.split(' at ');
            const regex = /Tado\.\s*(\S+)/;
            const match = stackParts[2].match(regex);
            if (match) {
                caller = match[1];
            }
        }
        let promise;
        this.debugLog(`TadoX ${this.isTadoX} | method ${method} | URL ${url} |body "${JSON.stringify(payload)}"`);
        const waitingTime = 300;  //time in ms to wait between calls
        try {
            // check if other call is in progress and if yes loop and wait
            if (method != 'get' && this.apiCallinExecution == true) {
                for (let i = 0; i < 10; i++) {
                    this.debugLog('Other API call in action, waiting... ' + url);
                    await this.sleep(waitingTime, waitingTime * 2);
                    this.debugLog('Waiting done! ' + url);
                    if (this.apiCallinExecution != true) {
                        this.debugLog('Time to execute ' + url); break;
                    } else {
                        this.debugLog('Oh, no! One more loop! ' + url);
                    }
                }
            }
            if (method != 'get') {
                this.apiCallinExecution = true;
            }
            promise = await new Promise((resolve, reject) => {
                if (this.accessToken) {
                    this.refreshToken()
                        .then(() => {
                            axiosInstance({
                                url: url,
                                method: method,
                                data: payload,
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
                                reject(`axiosInstance(${caller}) failed: ${error}`);
                            });
                        }).catch(error => {
                            reject('refreshToken() failed: ' + error);
                        });
                } else {
                    if (method != 'get') this.apiCallinExecution = false;
                    reject(new Error('Not yet logged in'));
                }
            });
        } catch (error) {
            let eMsg = `Issue at apiCall for '${method} ${url}': ${error}`;
            this.log.error(eMsg);
            console.error(eMsg);
            //let errorMsg = `${error} at apiCall for '${method} ${url}'`;
            //throw new Error(replaceNumbers(errorMsg));
            throw error;
        }
        return promise;
    }

    /**
     * @param {string} state
     * @param {string} name
     * @param {any} value
     */
    async create_state(state, name, value) {
        this.debugLog(`Create_state called for state '${state}' and name '${name}' with value '${value}'`);
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
            /*if (errorObject.message && (errorObject.message.includes('Login failed!') ||
                errorObject.message.includes('conflict occurred while trying to update entity null') ||
                errorObject.message.includes('ECONNRESET') ||
                errorObject.message.includes('socket hang up') ||
                errorObject.message.includes('with status code 504') ||
                errorObject.message.includes('ETIMEDOUT') ||
                errorObject.message.includes('EAI_AGAIN') ||
                errorObject.message.includes('timeout of 20000ms exceeded') ||
                errorObject.message.includes('No internet connection detected!'))) return;*/
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
            this.log.error(error + 'at errorHandling()');
        }
    }

    /**
     * @param {string} message
     */
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
    /**
     * @param {string} homeId
     */
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
 * @returns {boolean}
 */
function toBoolean(valueToBoolean) {
    return (valueToBoolean === true || valueToBoolean === 'true');
}

/**
 * @param {string} inputString
 * @returns {string}
 */
// @ts-ignore
// eslint-disable-next-line no-unused-vars
function replaceNumbers(inputString) {
    const regex = /(\/SU|\/VA|\/RU|\/)\d+/g;                                // Regular expression to find numbers that start with / or /RU or /SU or /VA
    const replacedString = inputString.replace(regex, (match, prefix) => {  // Replacement function called for each matching pattern
        const numberPart = match.substring(prefix.length);                  // The prefix (/ or /RU or /SU or /VA) is retained
        const replacedNumberPart = numberPart.replace(/\d/g, 'x');          // Replaces each digit in the number part with 'x'
        return prefix + replacedNumberPart;                                 // Returns the prefix and the replaced number part
    });
    return replacedString;
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