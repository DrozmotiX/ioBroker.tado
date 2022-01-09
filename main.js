/* eslint-disable prefer-const */
'use strict';

const utils = require('@iobroker/adapter-core');
const EXPIRATION_WINDOW_IN_SECONDS = 300;

const tado_auth_url = 'https://auth.tado.com';
const tado_url = 'https://my.tado.com';
const tado_config = {
	client: {
		id: 'tado-web-app',
		secret: 'wZaRN7rpjn3FoNyF5IFuxg9uMzYJcvOoQ8QWiIqS3hfk6gLhVlG57j5YNoZL2Rtc',
	},
	auth: {
		tokenHost: tado_auth_url,
	}
};
const { ResourceOwnerPassword } = require('simple-oauth2');
const JsonExplorer = require('iobroker-jsonexplorer');
const state_attr = require(`${__dirname}/lib/state_attr.js`); // Load attribute library
const axios = require('axios');
const isOnline = require('is-online');

const oneHour = 60 * 60 * 1000;
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
		this.accessToken = null;
		this.getMe_data = null;
		this.Home_data = null;
		this.lastupdate = 0;
		this.apiCallinExecution = false;
		JsonExplorer.init(this, state_attr);
		this.intervall_time = 60 * 1000;
		this.roomCapabilities = {};
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		this.log.info('Started with JSON-Explorer version ' + JsonExplorer.version);
		this.intervall_time = Math.max(30, this.config.intervall) * 1000;
		// Reset the connection indicator during startup
		this.setState('info.connection', false, true);
		await this.DoConnect();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.resetTimer();
			this.log.info('cleaned everything up...');
			callback();
		} catch (e) {
			callback();
		}
	}

	//////////////////////////////////////////////////////////////////////
	/* ON STATE CHANGE													*/
	//////////////////////////////////////////////////////////////////////
	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		if (state) {
			// The state was changed
			if (state.ack === false) {
				try {
					this.log.debug('GETS INTERESSTING!!!');
					const idSplitted = id.split('.');
					const home_id = idSplitted[2];
					const zone_id = idSplitted[4];
					const device_id = idSplitted[6];
					const statename = idSplitted[idSplitted.length - 1];
					this.log.debug(`Attribute '${id}' changed. '${statename}' will be checked.`);

					if (statename == 'offsetCelsius') {
						const offset = state;
						let set_offset = (offset == null || offset == undefined || offset.val == null) ? 0 : parseFloat(offset.val.toString());
						this.log.debug(`Offset changed for device '${device_id}' in home '${home_id}' to value '${set_offset}'`);
						this.setTemperatureOffset(home_id, zone_id, device_id, set_offset);
					} else if (statename == 'tt_id') {
						const tt_id = state;
						let set_tt_id = (tt_id == null || tt_id == undefined || tt_id.val == null || tt_id.val == '') ? 0 : parseInt(tt_id.val.toString());
						this.log.debug(`TimeTable changed for room '${zone_id}' in home '${home_id}' to value '${set_tt_id}'`);
						this.setActiveTimeTable(home_id, zone_id, set_tt_id);
					} else if (statename == 'presence') {
						const presence = state;
						let set_presence = (presence == null || presence == undefined || presence.val == null || presence.val == '') ? 'HOME' : presence.val.toString().toUpperCase();
						this.log.debug(`Presence changed in home '${home_id}' to value '${set_presence}'`);
						this.setPresenceLock(home_id, set_presence);
					} else if (statename == 'masterswitch') {
						const masterswitch = state;
						let set_masterswitch = (masterswitch == null || masterswitch == undefined || masterswitch.val == null || masterswitch.val == '') ? 'unknown' : masterswitch.val.toString().toUpperCase();
						this.log.debug(`Masterswitch changed in home '${home_id}' to value '${set_masterswitch}'`);
						await this.setMasterSwitch(set_masterswitch);
						await this.sleep(1000);
						this.setStateAsync(`${home_id}.Home.masterswitch`, '', true);
					} else {
						const type = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.type');
						const temperature = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.temperature.celsius');
						const mode = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.overlay.termination.typeSkillBasedApp');
						const power = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.power');
						const durationInSeconds = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.overlay.termination.durationInSeconds');
						const nextTimeBlockStart = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.nextTimeBlock.start');
						let acMode, fanLevel, horizontalSwing, verticalSwing, fanSpeed;

						let set_type = (type == null || type == undefined || type.val == null || type.val == '') ? 'HEATING' : type.val.toString().toUpperCase();
						let set_durationInSeconds = (durationInSeconds == null || durationInSeconds == undefined || durationInSeconds.val == null) ? 1800 : parseInt(durationInSeconds.val.toString());
						let set_temp = (temperature == null || temperature == undefined || temperature.val == null || temperature.val == '') ? 20 : parseFloat(temperature.val.toString());
						let set_power = (power == null || power == undefined || power.val == null || power.val == '') ? 'OFF' : power.val.toString().toUpperCase();
						let set_mode = (mode == null || mode == undefined || mode.val == null || mode.val == '') ? 'NO_OVERLAY' : mode.val.toString().toUpperCase();
						let set_NextTimeBlockStartExists = (nextTimeBlockStart == null || nextTimeBlockStart == undefined || nextTimeBlockStart.val == null || nextTimeBlockStart.val == '') ? false : true;

						if (set_type == 'AIR_CONDITIONING') {
							acMode = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.mode');
							fanSpeed = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.fanSpeed');
							fanLevel = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.fanLevel');
							horizontalSwing = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.horizontalSwing');
							verticalSwing = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.verticalSwing');
						}
						let set_horizontalSwing = '', set_verticalSwing = '', set_fanLevel = '', set_fanSpeed = '', set_acMode = '';
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


						switch (statename) {
							case ('overlayClearZone'):
								this.log.debug(`Overlay cleared for room '${zone_id}' in home '${home_id}'`);
								await this.clearZoneOverlay(home_id, zone_id);
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
								this.log.debug(`Temperature changed for room '${zone_id}' in home '${home_id}' to '${set_temp}'`);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed);
								break;

							case ('durationInSeconds'):
								set_mode = 'TIMER';
								this.log.debug(`DurationInSecond changed for room '${zone_id}' in home '${home_id}' to '${set_durationInSeconds}'`);
								this.setStateAsync(`${home_id}.Rooms.${zone_id}.overlay.termination.typeSkillBasedApp`, set_mode, true);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed);
								break;

							case ('fanSpeed'):
								this.log.debug(`FanSpeed changed for room '${zone_id}' in home '${home_id}' to '${set_fanSpeed}'`);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed);
								break;

							case ('mode'):
								this.log.debug(`Mode changed for room '${zone_id}' in home '${home_id}' to '${set_acMode}'`);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed);
								break;

							case ('fanLevel'):
								this.log.debug(`fanLevel changed for room '${zone_id}' in home '${home_id}' to '${set_fanLevel}'`);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed);
								break;

							case ('horizontalSwing'):
								this.log.debug(`horizontalSwing changed for room '${zone_id}' in home '${home_id}' to '${set_horizontalSwing}'`);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed);
								break;

							case ('verticalSwing'):
								this.log.debug(`verticalSwing changed for room '${zone_id}' in home '${home_id}' to '${set_verticalSwing}'`);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed);
								break;

							case ('typeSkillBasedApp'):
								if (set_mode == 'NO_OVERLAY') { break; }
								this.log.debug(`TypeSkillBasedApp changed for room '${zone_id}' in home '${home_id}' to '${set_mode}'`);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed);
								if (set_mode == 'MANUAL') {
									this.setStateAsync(`${home_id}.Rooms.${zone_id}.overlay.termination.expiry`, null, true);
									this.setStateAsync(`${home_id}.Rooms.${zone_id}.overlay.termination.durationInSeconds`, null, true);
									this.setStateAsync(`${home_id}.Rooms.${zone_id}.overlay.termination.remainingTimeInSeconds`, null, true);
								}
								break;

							case ('power'):
								if (set_mode == 'NO_OVERLAY') {
									if (set_power == 'ON') {
										this.log.debug(`Overlay cleared for room '${zone_id}' in home '${home_id}'`);
										await this.clearZoneOverlay(home_id, zone_id);
									}
									else {
										set_mode = 'MANUAL';
										this.log.debug(`Power changed for room '${zone_id}' in home '${home_id}' to '${state.val}' and temperature '${set_temp}' and mode '${set_mode}'`);
										await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed);
									}
								} else {
									this.log.debug(`Power changed for room '${zone_id}' in home '${home_id}' to '${state.val}' and temperature '${set_temp}' and mode '${set_mode}'`);
									await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_acMode, set_fanLevel, set_horizontalSwing, set_verticalSwing, set_fanSpeed);
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
				this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			}
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	//////////////////////////////////////////////////////////////////////
	/* API CALLS														*/
	//////////////////////////////////////////////////////////////////////
	/**
	 * @param {string} home_id
	 * @param {string} zone_id
	 */
	async clearZoneOverlay(home_id, zone_id) {
		let url = `/api/v2/homes/${home_id}/zones/${zone_id}/overlay`;
		if (await isOnline() == false) {
			throw new Error('No internet connection detected!');
		}
		await this.apiCall(url, 'delete');
		this.log.debug(`Called 'DELETE ${url}'`);
		await JsonExplorer.setLastStartTime();
		await this.DoZoneStates(home_id, zone_id);
		await JsonExplorer.checkExpire(home_id + '.Rooms.' + zone_id + '.overlay.*');
	}

	/**
	 * @param {string} home_id
	 * @param {string} zone_id
	 * @param {string} device_id
	 * @param {number} set_offset
	 */
	async setTemperatureOffset(home_id, zone_id, device_id, set_offset) {
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
			let apiResponse = await this.apiCall(`/api/v2/devices/${device_id}/temperatureOffset`, 'put', offset);
			this.log.debug(`API 'temperatureOffset' for home '${home_id}' and deviceID '${device_id}' with body ${JSON.stringify(offset)} called.`);
			this.log.debug(`Response from 'temperatureOffset' is ${JSON.stringify(apiResponse)}`);
			this.DoTemperatureOffset(home_id, zone_id, device_id, apiResponse);
		}
		catch (error) {
			let eMsg = `Issue at setTemperatureOffset: '${error}'. Based on body ${JSON.stringify(offset)}`;
			this.log.error(eMsg);
			console.error(eMsg);
			this.errorHandling(error);
		}
	}

	/**
	 * @param {string} home_id
	 * @param {string} zone_id
	 * @param {number} timetable_id
	 */
	async setActiveTimeTable(home_id, zone_id, timetable_id) {
		if (!timetable_id) timetable_id = 0;
		if (!(timetable_id == 0 || timetable_id == 1 || timetable_id == 2)) {
			this.log.error(`Invalid value '${timetable_id}' for state 'timetable_id'. Allowed values are '0', '1' and '2'.`);
			return;
		}
		const timeTable = {
			id: timetable_id
		};
		let apiResponse;
		this.log.debug('setActiveTimeTable JSON ' + JSON.stringify(timeTable));
		//this.log.info(`Call API 'activeTimetable' for home '${home_id}' and zone '${zone_id}' with body ${JSON.stringify(timeTable)}`);
		try {
			if (await isOnline() == false) {
				throw new Error('No internet connection detected!');
			}
			apiResponse = await this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/schedule/activeTimetable`, 'put', timeTable);

			this.DoTimeTables(home_id, zone_id, apiResponse);
			this.log.debug(`API 'activeTimetable' for home '${home_id}' and zone '${zone_id}' with body ${JSON.stringify(timeTable)} called.`);
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
	 * @param {string} home_id
	 * @param {string} homePresence
	 */
	async setPresenceLock(home_id, homePresence) {
		if (!homePresence) homePresence = 'HOME';
		if (homePresence != 'HOME' && homePresence != 'AWAY') {
			this.log.error(`Invalid value '${homePresence}' for state 'homePresence'. Allowed values are HOME and AWAY.`);
			return;
		}
		const homeState = {
			homePresence: homePresence.toUpperCase()
		};
		let apiResponse;
		this.log.debug('homePresence JSON ' + JSON.stringify(homeState));
		//this.log.info(`Call API 'activeTimetable' for home '${home_id}' and zone '${zone_id}' with body ${JSON.stringify(timeTable)}`);
		try {
			if (await isOnline() == false) {
				throw new Error('No internet connection detected!');
			}
			apiResponse = await this.apiCall(`/api/v2/homes/${home_id}/presenceLock`, 'put', homeState);
			this.DoHomeState(home_id);
			this.log.debug(`API 'state' for home '${home_id}' with body ${JSON.stringify(homeState)} called.`);
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
	 * @param {string} home_id
	 * @param {string} zone_id
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
	 */
	async setZoneOverlay(home_id, zone_id, power, temperature, typeSkillBasedApp, durationInSeconds, type, acMode, fanLevel, horizontalSwing, verticalSwing, fanSpeed) {
		power = power.toUpperCase();
		typeSkillBasedApp = typeSkillBasedApp.toUpperCase();
		durationInSeconds = Math.max(10, durationInSeconds);
		type = type.toUpperCase();
		fanSpeed = fanSpeed.toUpperCase();
		acMode = acMode.toUpperCase();
		fanLevel = fanLevel.toUpperCase();
		horizontalSwing = horizontalSwing.toUpperCase();
		verticalSwing = verticalSwing.toUpperCase();
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
			if (typeSkillBasedApp != 'TIMER' && typeSkillBasedApp != 'MANUAL' && typeSkillBasedApp != 'NEXT_TIME_BLOCK' && typeSkillBasedApp != 'NO_OVERLAY') {
				this.log.error(`Invalid value '${typeSkillBasedApp}' for state 'typeSkillBasedApp'. Allowed values are TIMER, MANUAL and NEXT_TIME_BLOCK`);
				return;
			}
			let capType = this.roomCapabilities[zone_id].type;
			if (capType && capType != type) {
				this.log.error(`Type ${type} not valid. Type ${capType} expected.`);
				return;
			}

			if (type == 'AIR_CONDITIONING') {
				let capSwings = this.roomCapabilities[zone_id][acMode].swings;
				let capCanSetTemperature = this.roomCapabilities[zone_id][acMode].canSetTemperature;
				let capLight = this.roomCapabilities[zone_id][acMode].light;

				if (capSwings || capCanSetTemperature || capLight) {
					this.log.error(`WE NEED YOUR HELP! Your Setup is not yet supported!`);
					this.log.error(`Please raise a ticket by using this URL 'https://github.com/DrozmotiX/ioBroker.tado/issues/new?labels=support&title=capabilities&body=capSwings:${capSwings}%20canSetTemperature:${capCanSetTemperature}%20light:${capLight}'`);
					this.log.error(`Pleas add this info to the ticket (if not automatically done): 'capSwings:${capSwings} canSetTemperature:${capCanSetTemperature} light:${capLight}'`);
					this.log.error(`THANKS FOR YOUR SUPPORT!`);
					console.log(JSON.stringify(this.roomCapabilities));
					this.sendSentryWarn('Aircondition with additional capailities');
				}
			}
			else {
				let capCanSetTemperature = this.roomCapabilities[zone_id].canSetTemperature;
				let capLight = this.roomCapabilities[zone_id].light;
				let capMinTemp = this.roomCapabilities[zone_id].temperatures.celsius.min;
				if (capCanSetTemperature || capLight || capMinTemp) {
					this.log.error(`WE NEED YOUR HELP! Your Setup is not yet supported!`);
					this.log.error(`Please raise a ticket by using this URL 'https://github.com/DrozmotiX/ioBroker.tado/issues/new?labels=support&title=capabilities&body=canSetTemperature:${capCanSetTemperature}%20light:${capLight}'`);
					this.log.error(`Pleas add this info to the ticket (if not automatically done): 'canSetTemperature:${capCanSetTemperature} light:${capLight}'`);
					this.log.error(`THANKS FOR YOUR SUPPORT!`);
					console.log(JSON.stringify(this.roomCapabilities));
					this.sendSentryWarn('Non-Aircondition with additional capailities');
				}
			}

			if (type == 'HEATING' && power == 'ON') {
				let capMinTemp = this.roomCapabilities[zone_id].temperatures.celsius.min;	//valide
				let capMaxTemp = this.roomCapabilities[zone_id].temperatures.celsius.max;	//valide

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
				let capCanSetTemperature = this.roomCapabilities[zone_id].canSetTemperature;	//unclear
				let capLight = this.roomCapabilities[zone_id].light;							//unclear
				let capMinTemp = this.roomCapabilities[zone_id].temperatures.celsius.min;		//unclear
				let capMaxTemp = this.roomCapabilities[zone_id].temperatures.celsius.max;		//unclear
				console.log(JSON.stringify(this.roomCapabilities));
				this.sendSentryWarn('HOTWATER with capailities');

				this.log.error(`WE NEED YOUR HELP! Your Setup is not yet supported!`);
				this.log.error(`Please raise a ticket by using this URL 'https://github.com/DrozmotiX/ioBroker.tado/issues/new?labels=support&title=capabilities&body=canSetTemperature:${capCanSetTemperature}%20light:${capLight}'`);
				this.log.error(`Pleas add this info to the ticket (if not automatically done): 'canSetTemperature:${capCanSetTemperature} light:${capLight}'`);
				this.log.error(`THANKS FOR YOUR SUPPORT!`);

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
				if (!this.roomCapabilities[zone_id][acMode]) {
					this.log.error(`AC-Mode ${acMode} not supported!`);
					return;
				}
				config.setting.mode = acMode;
				let capMinTemp = this.roomCapabilities[zone_id][acMode].temperatures.celsius.min;	//valide v3 & v3+
				let capMaxTemp = this.roomCapabilities[zone_id][acMode].temperatures.celsius.max;	//valide v3 & v3+
				let capHorizontalSwing = this.roomCapabilities[zone_id][acMode].horizontalSwing;	//valide v3+
				let capVerticalSwing = this.roomCapabilities[zone_id][acMode].verticalSwing;		//valide v3+
				let capFanLevel = this.roomCapabilities[zone_id][acMode].fanLevel;					//valide v3+
				let capFanSpeeds = this.roomCapabilities[zone_id][acMode].fanSpeeds;				//valide v3
				//let capSwings = this.roomCapabilities[zone_id][acMode].swings;						//unclear
				//let capCanSetTemperature = this.roomCapabilities[zone_id][acMode].canSetTemperature;//unclear
				//let capLight = this.roomCapabilities[zone_id][acMode].light;						//unclear

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
			}

			let result = await this.poolApiCall(home_id, zone_id, config);
			this.log.debug(`API 'ZoneOverlay' for home '${home_id}' and zone '${zone_id}' with body ${JSON.stringify(config)} called.`);

			if (result.setting.temperature == null) {
				result.setting.temperature = {};
				result.setting.temperature.celsius = null;
				result.setting.temperature.fahrenheit = null;
			}
			await JsonExplorer.setLastStartTime();
			await JsonExplorer.TraverseJson(result, home_id + '.Rooms.' + zone_id + '.overlay', true, true, 0, 2);
			await JsonExplorer.TraverseJson(result.setting, home_id + '.Rooms.' + zone_id + '.setting', true, true, 0, 2);
			await JsonExplorer.checkExpire(home_id + '.Rooms.' + zone_id + '.overlay.*');
		}
		catch (error) {
			console.log(`Body: ${JSON.stringify(config)}`);
			this.log.error(`Issue at setZoneOverlay: '${error}'. Based on config ${JSON.stringify(config)}`);
			console.error(`Issue at setZoneOverlay: '${error}'. Based on config ${JSON.stringify(config)}`);
			this.errorHandling(error);
		}
	}

	/**
	 * @param {string} home_id
	 * @param {string} zone_id
	 * @param {object} config
	 */
	async poolApiCall(home_id, zone_id, config) {
		this.log.debug(`poolApiCall() entered for '${home_id}/${zone_id}'`);
		let pooltimerid = home_id + zone_id;
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
				await that.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`, 'put', config).then(apiResponse => {
					resolve(apiResponse);
					that.log.debug(`API request finalized for '${home_id}/${zone_id}'`);
				}).catch(error => {
					reject(error);
				});
				that.log.debug(`API called with ${JSON.stringify(config)}`);
			}, 750);
		});
	}

	//////////////////////////////////////////////////////////////////////
	/* DO Methods														*/
	//////////////////////////////////////////////////////////////////////
	async DoData_Refresh(user, pass) {
		let outdated = false;
		let now = new Date().getTime();
		let step = 'start';
		if (now - this.lastupdate > oneHour) outdated = true;

		// Get login token
		try {
			step = 'login';
			await this.login(user, pass);
			const conn_state = await this.getStateAsync('info.connection');
			if (conn_state === undefined || conn_state === null) {
				return;
			} else {
				if (conn_state.val === false) {
					this.log.info('Connected to Tado cloud, initialyzing... ');
				}
			}

			// Get Basic data needed for all other querys and store to global variable
			step = 'getMet_data';
			if (this.getMe_data === null) {
				this.getMe_data = await this.getMe();
			}
			this.log.debug('GetMe result: ' + JSON.stringify(this.getMe_data));
			//set timestamp for 'Online'-state
			await JsonExplorer.setLastStartTime();

			for (const i in this.getMe_data.homes) {
				let homeID = String(this.getMe_data.homes[i].id);
				this.DoWriteJsonRespons(homeID, 'Stage_01_GetMe_Data', this.getMe_data);
				this.setObjectAsync(homeID, {
					'type': 'folder',
					'common': {
						'name': homeID,
					},
					'native': {},
				});
				if (outdated) {
					this.log.debug('Full refresh, data outdated (more than 60 minutes ago)');
					this.lastupdate = now;
					step = 'DoHome';
					await this.DoHome(homeID);
					step = 'DoDevices';
					await this.DoDevices(homeID);
				}
				step = 'DoMobileDevices';
				await this.DoMobileDevices(homeID);
				step = 'DoZones';
				await this.DoZones(homeID);
				step = 'DoWeather';
				await this.DoWeather(homeID);
				step = 'DoHomeState';
				await this.DoHomeState(homeID);

				//set all outdated states to NULL
				step = `Set outdated states to null`;
				if (outdated) {
					await JsonExplorer.checkExpire(homeID + '.*');
				} else {
					await JsonExplorer.checkExpire(homeID + '.Rooms.*');
					await JsonExplorer.checkExpire(homeID + '.Weather.*');
					await JsonExplorer.checkExpire(homeID + '.Mobile_Devices.*');
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
		const user = this.config.Username;
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

	async DoHome(HomeId) {
		// Get additional basic data for all homes
		if (this.Home_data === null) {
			this.Home_data = await this.getHome(HomeId);
		}
		this.log.debug('Home_data Result: ' + JSON.stringify(this.Home_data));
		this.Home_data.masterswitch = '';
		this.DoWriteJsonRespons(HomeId, 'Stage_02_HomeData', this.Home_data);
		JsonExplorer.TraverseJson(this.Home_data, `${HomeId}.Home`, true, true, 0, 0);
	}

	async DoWeather(HomeId) {
		const weather_data = await this.getWeather(HomeId);
		this.log.debug('Weather_data Result: ' + JSON.stringify(weather_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_04_Weather', weather_data);
		JsonExplorer.TraverseJson(weather_data, `${HomeId}.Weather`, true, true, 0, 0);
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
		this.DoWriteJsonRespons(HomeId, `Stage_12_Offset_${HomeId}`, offset);
		if (offset.celsius != undefined) offset.offsetCelsius = offset.celsius;
		if (offset.fahrenheit != undefined) offset.offsetFahrenheit = offset.fahrenheit;
		delete offset.celsius;
		delete offset.fahrenheit;
		JsonExplorer.TraverseJson(offset, `${HomeId}.Rooms.${ZoneId}.devices.${DeviceId}.offset`, true, true, 0, 2);
	}

	async DoDevices(HomeId) {
		const Devices_data = await this.getDevices(HomeId);
		this.log.debug('Devices Result: ' + JSON.stringify(Devices_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_03_Devices', Devices_data);
	}

	async DoMobileDevices(HomeId) {
		this.MobileDevices_data = await this.getMobileDevices(HomeId);
		this.log.debug('MobileDevices_data Result: ' + JSON.stringify(this.MobileDevices_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_06_MobileDevicesData', this.MobileDevices_data);
		JsonExplorer.TraverseJson(this.MobileDevices_data, `${HomeId}.Mobile_Devices`, true, true, 0, 0);
	}

	async DoMobileDeviceSettings(HomeId, DeviceId) {
		const MobileDeviceSettings_data = await this.getMobileDeviceSettings(HomeId, DeviceId);
		this.log.debug('MobileDeviceSettings_Data Result: ' + JSON.stringify(MobileDeviceSettings_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_07_MobileDevicesSettings_' + DeviceId, MobileDeviceSettings_data);
		JsonExplorer.TraverseJson(MobileDeviceSettings_data, `${HomeId}.MobileDevices.${DeviceId}.setting`, true, true, 0, 2);
	}

	async DoZones(HomeId) {
		this.Zones_data = await this.getZones(HomeId);
		this.log.debug('Zones_data Result: ' + JSON.stringify(this.Zones_data));
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
							this.DoTemperatureOffset(HomeId, ZoneId, DeviceId);
						}
					}
				}
			}
		}

		JsonExplorer.TraverseJson(this.Zones_data, `${HomeId}.Rooms`, true, true, 0, 0);

		for (const i in this.Zones_data) {
			let zoneId = this.Zones_data[i].id;
			await this.DoZoneStates(HomeId, zoneId);
			await this.DoCapabilities(HomeId, zoneId);
			await this.DoAwayConfiguration(HomeId, zoneId);
			await this.DoTimeTables(HomeId, zoneId);
		}
	}

	async DoZoneStates(HomeId, ZoneId) {
		const ZonesState_data = await this.getZoneState(HomeId, ZoneId);
		this.log.debug(`ZoneStates_data result for room '${ZoneId}' is ${JSON.stringify(ZonesState_data)}`);
		if (ZonesState_data.setting.temperature == null) {
			ZonesState_data.setting.temperature = {};
			ZonesState_data.setting.temperature.celsius = null;
		}
		this.DoWriteJsonRespons(HomeId, 'Stage_09_ZoneStates_data_' + ZoneId, ZonesState_data);
		ZonesState_data.overlayClearZone = false;
		JsonExplorer.TraverseJson(ZonesState_data, HomeId + '.Rooms.' + ZoneId, true, true, 0, 2);
	}

	async DoCapabilities(homeId, zoneId) {
		let capabilities_data;
		if (this.roomCapabilities[zoneId]) capabilities_data = this.roomCapabilities[zoneId];
		else capabilities_data = await this.getCapabilities(homeId, zoneId);
		this.roomCapabilities[zoneId] = capabilities_data;
		this.log.debug(`Capabilities_data result for room '${zoneId}' is ${JSON.stringify(capabilities_data)}`);
		this.DoWriteJsonRespons(homeId, 'Stage_09_Capabilities_data_' + zoneId, capabilities_data);
		JsonExplorer.TraverseJson(capabilities_data, homeId + '.Rooms.' + zoneId + '.capabilities', true, true, 0, 2);
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
		TimeTables_data.tt_id = TimeTables_data.id;
		delete TimeTables_data.id;
		this.log.debug('ZoneOverlay_data Result: ' + JSON.stringify(TimeTables_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_13_TimeTables_' + ZoneId, TimeTables_data);
		this.log.debug('Timetable for room ' + ZoneId + ' is ' + JSON.stringify(TimeTables_data));
		JsonExplorer.TraverseJson(TimeTables_data, HomeId + '.Rooms.' + ZoneId + '.timeTables', true, true, 0, 2);
	}

	async DoAwayConfiguration(HomeId, ZoneId) {
		const AwayConfiguration_data = await this.getAwayConfiguration(HomeId, ZoneId);
		this.log.debug('AwayConfiguration_data Result: ' + JSON.stringify(AwayConfiguration_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_10_AwayConfiguration_' + ZoneId, AwayConfiguration_data);
		JsonExplorer.TraverseJson(AwayConfiguration_data, HomeId + '.Rooms.' + ZoneId + '.awayConfig', true, true, 0, 2);
	}

	async DoWriteJsonRespons(HomeId, state_name, value) {
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

	async DoHomeState(HomeId, homeState_data = null) {
		if (homeState_data == null) {
			homeState_data = await this.getHomeState(HomeId);
		}
		this.log.debug('HomeState_data Result: ' + JSON.stringify(homeState_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_11_HomeState', homeState_data);
		JsonExplorer.TraverseJson(homeState_data, HomeId + '.Home.state', true, true, 0, 1);
	}

	//////////////////////////////////////////////////////////////////////
	/* MASTERSWITCH														*/
	//////////////////////////////////////////////////////////////////////
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
						this.setStateAsync(overlayClearZonePath, true);
					} else {
						this.setStateAsync(powerPath, 'OFF');
						this.setStateAsync(typeSkillBasedAppPath, 'MANUAL');
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
		const { token } = this.accessToken;
		const expirationTimeInSeconds = token.expires_at.getTime() / 1000;
		const expirationWindowStart = expirationTimeInSeconds - EXPIRATION_WINDOW_IN_SECONDS;

		// If the start of the window has passed, refresh the token
		const nowInSeconds = (new Date()).getTime() / 1000;
		const shouldRefresh = nowInSeconds >= expirationWindowStart;

		return new Promise((resolve, reject) => {
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
		});
	}

	async login(username, password) {
		const client = new ResourceOwnerPassword(tado_config);
		const tokenParams = {
			username: username,
			password: password,
			scope: 'home.user',
		};
		try {
			this.accessToken = await client.getToken(tokenParams);
		} catch (error) {
			throw new Error('Login failed! Please verify Username and Password');
		}
	}

	/**
	 * @param {number} msmin
	 */
	sleep(msmin, msmax = msmin) {
		let ms = Math.random() * (msmax - msmin) + msmin;
		this.log.debug('Waiting time is ' + ms + 'ms');
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * @param {string} url
	 */
	async apiCall(url, method = 'get', data = {}) {
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
		}
		return new Promise((resolve, reject) => {
			if (this.accessToken) {
				this.refreshToken().then(() => {
					// @ts-ignore
					axios({
						url: tado_url + url,
						method: method,
						data: data,
						headers: {
							Authorization: 'Bearer ' + this.accessToken.token.access_token
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
				});
			} else {
				if (method != 'get') this.apiCallinExecution = false;
				reject(new Error('Not yet logged in'));
			}
		});
	}

	/**
	 * @param {string} state
	 * @param {string} name
	 * @param {any} value
	 */
	async create_state(state, name, value) {
		this.log.debug(`Create_state called for state '${state}' and name '${name}' with value '${value}'`);
		const intervall_time = (this.config.intervall * 4);
		if (value) {
			JsonExplorer.stateSetCreate(state, name, value, intervall_time);
		}
	}

	async errorHandling(error) {
		if (error.message && (error.message.includes('Login failed!') || error.message.includes('ETIMEDOUT') || error.message.includes('EAI_AGAIN') || error.message.includes('No internet connection detected!'))) return;
		if (this.log.level != 'debug' && this.log.level != 'silly') {
			if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
				const sentryInstance = this.getPluginInstance('sentry');
				if (sentryInstance) {
					sentryInstance.getSentryObject().captureException(error);
				}
			}
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
	getMe() {
		return this.apiCall('/api/v2/me');
	}

	// Read account information and all home related data
	getHome(home_id) {
		return this.apiCall(`/api/v2/homes/${home_id}`);
	}

	// Get weather information for home location
	getWeather(home_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/weather`);
	}

	// User information equal to Weather, ignoring function but keep for history/feature functionality
	getUsers(home_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/users`);
	}

	// Function disabled, no data in API ?
	getState_info(home_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/state`);
	}

	getMobileDevices(home_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/mobileDevices`);
	}

	getMobileDevice(home_id, device_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/mobileDevices/${device_id}`);
	}

	getMobileDeviceSettings(home_id, device_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/mobileDevices/${device_id}/settings`);
	}

	getZones(home_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones`);
	}

	getZoneState(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/state`);
	}

	getCapabilities(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/capabilities`);
	}

	getAwayConfiguration(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/awayConfiguration`);
	}

	getTimeTables(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/schedule/activeTimetable`);
	}

	getTemperatureOffset(device_id) {
		return this.apiCall(`/api/v2/devices/${device_id}/temperatureOffset`);
	}

	getHomeState(home_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/state`);
	}

	/*getDevices(home_id) {
		this.log.info('getDevices called')
		return this.apiCall(`/api/v2/homes/${home_id}/devices`);
	}*/

	/*getZoneOverlay(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`);
	}*/

	/*getInstallations(home_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/installations`);
	}*/
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
