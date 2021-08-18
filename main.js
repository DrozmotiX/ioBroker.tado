/* eslint-disable prefer-const */
'use strict';

/*
* Created with @iobroker/create-adapter v1.16.0
*/

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
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
		this._accessToken = null;
		this.getMe_data = null;
		this.Home_data = null;
		this.lastupdate = 0;
		JsonExplorer.init(this, state_attr);
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		this.log.info('Started with JSON-Explorer version ' + JsonExplorer.version);
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
					let set_temp = 0;
					let set_mode = '';
					let set_power = '';
					let set_durationInSeconds = 0;
					let set_type = '';
					let set_fanSpeed = '';
					let set_tadomode = '';
					let set_offset = 0;
					let set_tt_id = 0;

					this.log.debug('GETS INTERESSTING!!!');
					const deviceId = id.split('.');
					let x = deviceId.length - 1;
					this.log.debug(`Attribute '${deviceId}' changed. '${deviceId[x]}' will be checked.`);

					const home_id = deviceId[2];
					const zone_id = deviceId[4];

					if (deviceId[x] == 'offsetCelsius') {
						const offset = await this.getStateAsync(id);
						const device_id = deviceId[6];
						// @ts-ignore
						set_offset = (offset == null || offset == undefined || offset.val == null) ? 0 : parseFloat(offset.val);
						this.log.info(`Offset changed for device '${deviceId[6]}' in home '${home_id}' to value '${set_offset}'`);
						this.setTemperatureOffset(home_id, zone_id, device_id, set_offset);
					} else if (deviceId[x] == 'tt_id') {
						const tt_id = await this.getStateAsync(id);
						// @ts-ignore
						set_tt_id = (tt_id == null || tt_id == undefined || tt_id.val == null) ? 0 : parseInt(tt_id.val);
						this.log.info(`TimeTable changed for room '${zone_id}' in home '${home_id}' to value '${set_tt_id}'`);
						this.setActiveTimeTable(home_id, zone_id, set_tt_id);
					} else {
						const type = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.type');
						const temperature = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.temperature.celsius');
						const mode = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.overlay.termination.typeSkillBasedApp');
						const power = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.power');
						const durationInSeconds = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.overlay.termination.durationInSeconds');
						let tadomode, fanSpeed;

						set_type = (type == null || type == undefined || type.val == null || type.val == '') ? 'HEATING' : type.val.toString().toUpperCase();
						// @ts-ignore
						set_durationInSeconds = (durationInSeconds == null || durationInSeconds == undefined || durationInSeconds.val == null) ? 1800 : parseInt(durationInSeconds.val);
						// @ts-ignore
						set_temp = (temperature == null || temperature == undefined || temperature.val == null) ? 20 : Math.max(5, parseFloat(temperature.val));
						set_power = (power == null || power == undefined || power.val == null || power.val == '') ? 'OFF' : power.val.toString().toUpperCase();
						set_mode = (mode == null || mode == undefined || mode.val == null || mode.val == '') ? 'NO_OVERLAY' : mode.val.toString().toUpperCase();

						if (set_type == 'AIR_CONDITIONING') {
							tadomode = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.mode');
							fanSpeed = await this.getStateAsync(home_id + '.Rooms.' + zone_id + '.setting.fanSpeed');
						}
						set_tadomode = (tadomode == null || tadomode == undefined || tadomode.val == null || tadomode.val == '') ? 'COOL' : tadomode.val.toString().toUpperCase();
						set_fanSpeed = (fanSpeed == null || fanSpeed == undefined || fanSpeed.val == null || fanSpeed.val == '') ? 'AUTO' : fanSpeed.val.toString().toUpperCase();

						if (set_type == 'HOT_WATER' && set_temp < 30) {
							this.log.debug(`Temperature set to 60° instead of ${set_temp} for HOT_WATER`);
							set_temp = 60;
						}

						this.log.debug('Type is: ' + set_type);
						this.log.debug('Power is: ' + set_power);
						this.log.debug(`Temperature is: ${set_temp}`);
						this.log.debug('Execution mode (typeSkillBasedApp) is: ' + set_mode);
						this.log.debug('DurationInSeconds is: ' + set_durationInSeconds);
						this.log.debug('Mode is: ' + set_tadomode);
						this.log.debug('FanSpeed is: ' + set_fanSpeed);

						switch (deviceId[x]) {
							case ('overlayClearZone'):
								this.log.info(`Overlay cleared for room '${zone_id}' in home '${home_id}'`);
								await this.clearZoneOverlay(home_id, zone_id);
								break;

							case ('celsius'):
								if (set_mode == 'NO_OVERLAY') { set_mode = 'NEXT_TIME_BLOCK'; }
								set_power = 'ON';
								this.log.info(`Temperature changed for room '${zone_id}' in home '${home_id}' to '${set_temp}'`);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
								break;

							case ('durationInSeconds'):
								set_mode = 'TIMER';
								this.log.info(`DurationInSecond changed for room '${zone_id}' in home '${home_id}' to '${set_durationInSeconds}'`);
								this.setStateAsync(`${home_id}.Rooms.${zone_id}.overlay.termination.typeSkillBasedApp`, set_mode, true);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
								break;

							case ('fanSpeed'):
								this.log.info(`FanSpeed changed for room '${zone_id}' in home '${home_id}' to '${set_fanSpeed}'`);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
								break;

							case ('mode'):
								this.log.info(`Mode changed for room '${zone_id}' in home '${home_id}' to '${set_tadomode}'`);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
								break;

							case ('typeSkillBasedApp'):
								if (set_mode == 'NO_OVERLAY') { break; }
								this.log.info(`TypeSkillBasedApp changed for room '${zone_id}' in home '${home_id}' to '${set_mode}'`);
								await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
								if (set_mode == 'MANUAL') {
									this.setStateAsync(`${home_id}.Rooms.${zone_id}.overlay.termination.expiry`, null, true);
									this.setStateAsync(`${home_id}.Rooms.${zone_id}.overlay.termination.durationInSeconds`, null, true);
									this.setStateAsync(`${home_id}.Rooms.${zone_id}.overlay.termination.remainingTimeInSeconds`, null, true);
								}
								break;

							case ('power'):
								if (set_mode == 'NO_OVERLAY') {
									if (set_power == 'ON') {
										this.log.info(`Overlay cleared for room '${zone_id}' in home '${home_id}'`);
										await this.clearZoneOverlay(home_id, zone_id);
									}
									else {
										set_mode = 'MANUAL';
										this.log.info(`Power changed for room '${zone_id}' in home '${home_id}' to '${state.val}' and temperature '${set_temp}' and mode '${set_mode}'`);
										await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
									}
								} else {
									this.log.info(`Power changed for room '${zone_id}' in home '${home_id}' to '${state.val}' and temperature '${set_temp}' and mode '${set_mode}'`);
									await this.setZoneOverlay(home_id, zone_id, set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
								}
								break;
							default:
						}
					}
					this.log.debug('State change detected from different source than adapter');
					this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
				} catch (error) {
					this.log.error(`Issue at state change: ${error}`);
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

	async clearZoneOverlay(home_id, zone_id) {
		let url = `/api/v2/homes/${home_id}/zones/${zone_id}/overlay`;
		this.log.debug(`Called 'DELETE ${url}'`);
		await this.apiCall(url, 'delete');
		await JsonExplorer.setLastStartTime();
		await this.DoZoneStates(home_id, zone_id);
		await JsonExplorer.checkExpire(home_id + '.Rooms.' + zone_id + '.overlay.*');
	}

	async setTemperatureOffset(home_id, zone_id, device_id, set_offset) {
		const offset = {
			celsius: set_offset
		};
		this.log.info(`Call API 'temperatureOffset' for home '${home_id}' and deviceID '${device_id}' with body ${JSON.stringify(offset)}`);
		let apiResponse = await this.apiCall(`/api/v2/devices/${device_id}/temperatureOffset`, 'put', offset);
		this.log.debug(`Response from 'temperatureOffset' is ${JSON.stringify(apiResponse)}`);
		this.DoTemperatureOffset(home_id, zone_id, device_id, apiResponse);
	}

	async setActiveTimeTable(home_id, zone_id, timetable_id) {
		const timeTable = {
			id: timetable_id
		};
		this.log.debug('setActiveTimeTable JSON ' + JSON.stringify(timeTable));
		this.log.info(`Call API 'activeTimetable' for home '${home_id}' and zone '${zone_id}' with body ${JSON.stringify(timeTable)}`);
		let apiResponse = await this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/schedule/activeTimetable`, 'put', timeTable);
		this.log.debug(`Response from 'setActiveTimeTable' is ${JSON.stringify(apiResponse)}`);
		this.DoTimeTables(home_id, zone_id, apiResponse);
	}

	async setZoneOverlay(home_id, zone_id, power, temperature, typeSkillBasedApp, durationInSeconds, type, fanSpeed, mode) {
		const config = {
			setting: {
				type: type,
			},
			termination: {
			}
		};

		if (type == 'AIR_CONDITIONING') {
			//Aircondiition: Fanspeed not allowed in modes DRY, AUTO, FAN
			if (mode != 'DRY' && mode != 'AUTO' && mode != 'FAN') {
				config.setting.fanSpeed = fanSpeed;
			}
			config.setting.mode = mode;
		}

		if (power.toLowerCase() == 'on') {
			config.setting.power = 'ON';
			//Temperature not for for aircondition if mode is DRY, AUTO, FAN
			if (temperature && !(type == 'AIR_CONDITIONING' && (mode == 'DRY' || mode == 'AUTO' || mode == 'FAN'))) {
				config.setting.temperature = {};
				config.setting.temperature.celsius = temperature;
			}
		} else {
			config.setting.power = 'OFF';
		}

		config.termination.typeSkillBasedApp = typeSkillBasedApp;
		if (typeSkillBasedApp != 'TIMER') {
			config.termination.durationInSeconds = null;
		}
		else {
			config.termination.durationInSeconds = durationInSeconds;
		}

		this.log.info(`Call API 'ZoneOverlay' for home '${home_id}' and zone '${zone_id}' with body ${JSON.stringify(config)}`);
		let result = await this.poolApiCall(home_id, zone_id, config);
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

	/**
	 * @param {string} home_id
	 * @param {string} zone_id
	 * @param {object} config
	 */
	poolApiCall(home_id, zone_id, config) {
		let pooltimerid = home_id + zone_id;
		(function () { if (pooltimer[pooltimerid]) { clearTimeout(pooltimer[pooltimerid]); pooltimer[pooltimerid] = null; } })();
		let that = this;
		return new Promise(function (resolve) {
			pooltimer[pooltimerid] = setTimeout(async () => {
				that.log.debug(`Timeout set for timer '${pooltimerid}' with 750ms`);
				let apiResponse = await that.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`, 'put', config);
				that.log.debug(`API called with ${JSON.stringify(config)}`);
				resolve(apiResponse);
			}, 750);
		});
	}

	//////////////////////////////////////////////////////////////////////
	/* DO Methods														*/
	//////////////////////////////////////////////////////////////////////

	async DoData_Refresh(user, pass) {
		const intervall_time = Math.max(30, this.config.intervall) * 1000;
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
				this.DoWriteJsonRespons(this.getMe_data.homes[i].id, 'Stage_01_GetMe_Data', this.getMe_data);
				if (outdated) {
					this.log.debug('Full refresh, data outdated (more than 60 minutes ago)');
					this.lastupdate = now;
					step = 'DoHome';
					await this.DoHome(this.getMe_data.homes[i].id);
					step = 'DoDevices';
					await this.DoDevices(this.getMe_data.homes[i].id);
				}
				step = 'DoMobileDevices';
				await this.DoMobileDevices(this.getMe_data.homes[i].id);
				step = 'DoZones';
				await this.DoZones(this.getMe_data.homes[i].id);
				step = 'DoWeather';
				await this.DoWeather(this.getMe_data.homes[i].id);

				//set all outdated states to NULL
				step = `Set outdated states to null`;
				if (outdated) {
					await JsonExplorer.checkExpire(this.getMe_data.homes[i].id + '.*');
				} else {
					await JsonExplorer.checkExpire(this.getMe_data.homes[i].id + '.Rooms.*');
					await JsonExplorer.checkExpire(this.getMe_data.homes[i].id + '.Weather.*');
					await JsonExplorer.checkExpire(this.getMe_data.homes[i].id + '.Mobile_Devices.*');
				}
			}

			if (conn_state === undefined || conn_state === null) {
				return;
			} else {

				if (conn_state.val === false) {
					this.log.info(`Initialisation finished, connected to Tado cloud service refreshing every ${intervall_time / 1000} seconds`);
					this.setState('info.connection', true, true);
				}
			}

			// Clear running timer
			(function () { if (polling) { clearTimeout(polling); polling = null; } })();
			// timer
			polling = setTimeout(() => {
				this.DoConnect();
			}, intervall_time);
		} catch (error) {
			this.log.error(`Error in data refresh at step ${step}: ${error}`);
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

		// Check if credentials are not empty
		if (user !== '' && pass !== '') {
			try {
				await this.DoData_Refresh(user, pass);
			} catch (error) {
				this.log.error(error);
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
		this.DoWriteJsonRespons(HomeId, 'Stage_02_HomeData', this.Home_data);
		JsonExplorer.TraverseJson(this.Home_data, `${HomeId}.Home`, true, true, 0, 0);
	}

	async DoWeather(HomeId) {
		const weather_data = await this.getWeather(HomeId);
		this.log.debug('Weather_data Result: ' + JSON.stringify(weather_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_04_Weather', weather_data);
		JsonExplorer.TraverseJson(weather_data, `${HomeId}.Weather`, true, true, 0, 0);
	}

	async DoTemperatureOffset(HomeId, ZoneId, DeviceId, offset = null) {
		if (offset == null) {
			offset = await this.getTemperatureOffset(DeviceId);
		}
		this.log.debug(`Offset Result for DeviceID '${DeviceId}': ${JSON.stringify(offset)}`);
		this.DoWriteJsonRespons(HomeId, `Stage_99_Offset_${HomeId}`, offset);
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
			await this.DoZoneStates(HomeId, this.Zones_data[i].id);
			await this.DoAwayConfiguration(HomeId, this.Zones_data[i].id);
			await this.DoTimeTables(HomeId, this.Zones_data[i].id);
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

	async DoTimeTables(HomeId, ZoneId, TimeTables_data = null) {
		if (TimeTables_data == null) {
			TimeTables_data = await this.getTimeTables(HomeId, ZoneId);
		}
		TimeTables_data.tt_id = TimeTables_data.id;
		delete TimeTables_data.id;
		this.log.debug('ZoneOverlay_data Result: ' + JSON.stringify(TimeTables_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_13_TimeTables_' + ZoneId, TimeTables_data);
		this.log.debug('Timetable for room ' + ZoneId + ' is ' + JSON.stringify(TimeTables_data));
		JsonExplorer.TraverseJson(TimeTables_data, HomeId + '.Rooms.' + ZoneId + '.TimeTables', true, true, 0, 2);
	}

	async DoAwayConfiguration(HomeId, ZoneId) {
		const AwayConfiguration_data = await this.getAwayConfiguration(HomeId, ZoneId);
		this.log.debug('AwayConfiguration_data Result: ' + JSON.stringify(AwayConfiguration_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_10_AwayConfiguration_' + ZoneId, AwayConfiguration_data);
		JsonExplorer.TraverseJson(AwayConfiguration_data, HomeId + '.Rooms.' + ZoneId + '.AwayConfig', true, true, 0, 2);
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

	//////////////////////////////////////////////////////////////////////
	/* MISC																*/
	//////////////////////////////////////////////////////////////////////

	_refreshToken() {
		const { token } = this._accessToken;
		const expirationTimeInSeconds = token.expires_at.getTime() / 1000;
		const expirationWindowStart = expirationTimeInSeconds - EXPIRATION_WINDOW_IN_SECONDS;

		// If the start of the window has passed, refresh the token
		const nowInSeconds = (new Date()).getTime() / 1000;
		const shouldRefresh = nowInSeconds >= expirationWindowStart;

		return new Promise((resolve, reject) => {
			if (shouldRefresh) {
				this._accessToken.refresh()
					.then(result => {
						this._accessToken = result;
						resolve(this._accessToken);
					})
					.catch(error => {
						reject(error);
					});
			} else {
				resolve(this._accessToken);
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
			this._accessToken = await client.getToken(tokenParams);
		} catch (error) {
			console.log('Access Token Error', error.message);
		}
	}

	apiCall(url, method = 'get', data = {}) {
		return new Promise((resolve, reject) => {
			if (this._accessToken) {
				this._refreshToken().then(() => {
					// @ts-ignore
					axios({
						url: tado_url + url,
						method: method,
						data: data,
						headers: {
							Authorization: 'Bearer ' + this._accessToken.token.access_token
						}
					}).then(response => {
						resolve(response.data);
					}).catch(error => {
						reject(error);
					});
				});
			} else {
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

	async errorHandling(codePart, error) {
		this.log.error(`[${codePart}] error: ${error.message}, stack: ${error.stack}`);
		if (this.log.level != 'debug' && this.log.level != 'silly') {
			if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
				const sentryInstance = this.getPluginInstance('sentry');
				if (sentryInstance) {
					sentryInstance.getSentryObject().captureException(error);
				}
			}
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

	getAwayConfiguration(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/awayConfiguration`);
	}

	getTimeTables(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/schedule/activeTimetable`);
	}

	getTemperatureOffset(device_id) {
		return this.apiCall(`/api/v2/devices/${device_id}/temperatureOffset`);
	}

	/*getDevices(home_id) {
		this.log.info('getDevices called')
		return this.apiCall(`/api/v2/homes/${home_id}/devices`);
	}*/

	/*getTimeTable(home_id, zone_id, timetable_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/schedule/timetables/${timetable_id}/blocks`);
	}*/

	/*getZoneOverlay(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`);
	}*/

	/*
	getZoneCapabilities(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/capabilities`);
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
