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

const oauth2 = require('simple-oauth2').create(tado_config);
const JsonExplorer = require('iobroker-jsonexplorer');
const state_attr = require(`${__dirname}/lib/state_attr.js`); // Load attribute library
const axios = require('axios');

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
		this.startprocedure = null;
		JsonExplorer.init(this, state_attr);
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		this.log.info('Started with JSON-Explorer version ' + JsonExplorer.version);
		this.startprocedure = true;
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
					const deviceId = id.split('.');
					let set_temp = 0;
					let set_mode = '';
					let set_power = '';
					let set_durationInSeconds = 0;
					let set_type = '';
					let set_fanSpeed = '';
					let set_tadomode = '';
					let offset = null;
					let set_offset = 0;

					this.log.debug('GETS INTERESSTING!!!');

					//if (deviceId[x])   //ACT HERE!!!

					const temperature = await this.getStateAsync(deviceId[2] + '.Rooms.' + deviceId[4] + '.setting.temperature.celsius');
					const mode = await this.getStateAsync(deviceId[2] + '.Rooms.' + deviceId[4] + '.overlay.termination.typeSkillBasedApp');
					const power = await this.getStateAsync(deviceId[2] + '.Rooms.' + deviceId[4] + '.setting.power');
					const type = await this.getStateAsync(deviceId[2] + '.Rooms.' + deviceId[4] + '.setting.type');
					const durationInSeconds = await this.getStateAsync(deviceId[2] + '.Rooms.' + deviceId[4] + '.overlay.termination.durationInSeconds');
					const tadomode = await this.getStateAsync(deviceId[2] + '.Rooms.' + deviceId[4] + '.setting.mode');
					const fanSpeed = await this.getStateAsync(deviceId[2] + '.Rooms.' + deviceId[4] + '.setting.fanSpeed');

					set_tadomode = (tadomode == null || tadomode == undefined || tadomode.val == null) ? 'COOL' : tadomode.val.toString().toUpperCase();
					this.log.debug('Mode set : ' + set_tadomode);
					set_fanSpeed = (fanSpeed == null || fanSpeed == undefined || fanSpeed.val == null) ? 'AUTO' : fanSpeed.val.toString().toUpperCase();
					this.log.debug('FanSpeed set : ' + set_tadomode);
					// @ts-ignore
					set_durationInSeconds = (durationInSeconds == null || durationInSeconds == undefined || durationInSeconds.val == null) ? 1800 : parseInt(durationInSeconds.val);
					this.log.debug('DurationInSeconds set : ' + set_durationInSeconds);
					// @ts-ignore
					set_temp = (temperature == null || temperature == undefined || temperature.val == null) ? 20 : Math.max(5, parseFloat(temperature.val));
					this.log.debug(`Room Temperature set: ${set_temp}`);
					set_power = (power == null || power == undefined || power.val == null || power.val == '') ? 'OFF' : power.val.toString().toUpperCase();
					this.log.debug('Room power set : ' + set_power);
					set_type = (type == null || type == undefined || type.val == null || type.val == '') ? 'HEATING' : type.val.toString().toUpperCase();
					this.log.debug('Type set : ' + set_type);

					if (mode == null || mode == undefined || mode.val == null || mode.val == '') {
						set_mode = 'NO_OVERLAY';
					} else {
						if (mode.val != '') {
							set_mode = mode.val.toString().toUpperCase();
						} else {
							set_mode = 'NEXT_TIME_BLOCK';
						}
					}
					this.log.debug('Room mode set : ' + set_mode);

					let x = deviceId.length - 1;
					this.log.info(`Attribute '${deviceId}' changed. '${deviceId[x]}' will be checked.`);

					switch (deviceId[x]) {
						case ('offsetCelsius'):
							offset = await this.getStateAsync(id);
							// @ts-ignore
							set_offset = (offset == null || offset == undefined || offset.val == null) ? 0 : parseFloat(offset.val);
							this.log.info('OFFSET changed: ' + id);
							this.log.info(`Offset changed for devive '${deviceId[6]}' in home '${deviceId[4]}' to value '${set_offset}'`);
							break;
						case ('overlayClearZone'):
							this.log.info(`Overlay cleared for room: ${deviceId[4]} in home: ${deviceId[2]}`);
							await this.clearZoneOverlay(deviceId[2], deviceId[4]);
							break;

						case ('celsius'):
							if (set_mode == 'NO_OVERLAY') { set_mode = 'NEXT_TIME_BLOCK'; }
							this.log.info(`Temperature changed for room: ${deviceId[4]} in home: ${deviceId[2]} to API with: ${set_temp}`);
							await this.setZoneOverlay(deviceId[2], deviceId[4], set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
							break;

						case ('durationInSeconds'):
							set_mode = 'TIMER';
							this.log.info(`DurationInSecond changed for room: ${deviceId[4]} in home: ${deviceId[2]} to API with: ${set_durationInSeconds}`);
							this.setStateAsync(`${deviceId[2]}.Rooms.${deviceId[4]}.overlay.termination.typeSkillBasedApp`, set_mode, true);
							await this.setZoneOverlay(deviceId[2], deviceId[4], set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
							break;

						case ('fanSpeed'):
							this.log.info(`FanSpeed changed for room: ${deviceId[4]} in home: ${deviceId[2]} to API with: ${set_fanSpeed}`);
							await this.setZoneOverlay(deviceId[2], deviceId[4], set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
							break;

						case ('mode'):
							this.log.info(`Mode changed for room: ${deviceId[4]} in home: ${deviceId[2]} to API with: ${set_tadomode}`);
							await this.setZoneOverlay(deviceId[2], deviceId[4], set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
							break;

						case ('typeSkillBasedApp'):
							if (set_mode == 'NO_OVERLAY') { break; }
							this.log.info(`TypeSkillBasedApp changed for room: ${deviceId[4]} in home: ${deviceId[2]} to API with: ${set_mode}`);
							await this.setZoneOverlay(deviceId[2], deviceId[4], set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
							if (set_mode == 'MANUAL') {
								this.setStateAsync(`${deviceId[2]}.Rooms.${deviceId[4]}.overlay.termination.expiry`, null, true);
								this.setStateAsync(`${deviceId[2]}.Rooms.${deviceId[4]}.overlay.termination.durationInSeconds`, null, true);
								this.setStateAsync(`${deviceId[2]}.Rooms.${deviceId[4]}.overlay.termination.remainingTimeInSeconds`, null, true);
							}
							break;

						case ('power'):
							if (set_mode == 'NO_OVERLAY') {
								if (set_power == 'ON') {
									this.log.info(`Overlay cleared for room: ${deviceId[4]} in home: ${deviceId[2]}`);
									await this.clearZoneOverlay(deviceId[2], deviceId[4]);
								}
								else {
									set_mode = 'MANUAL';
									this.log.info(`Power changed for room: ${deviceId[4]} in home: ${deviceId[2]} to API with: ${state.val} and Temperature: ${set_temp} and mode: ${set_mode}`);
									await this.setZoneOverlay(deviceId[2], deviceId[4], set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
								}
							} else {
								this.log.info(`Power changed for room: ${deviceId[4]} in home: ${deviceId[2]} to API with: ${state.val} and Temperature: ${set_temp} and mode: ${set_mode}`);
								await this.setZoneOverlay(deviceId[2], deviceId[4], set_power, set_temp, set_mode, set_durationInSeconds, set_type, set_fanSpeed, set_tadomode);
							}
							break;
						default:
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

	async DoConnect() {
		// this.log.info('Username : ' + user + ' Password : ' + pass);
		const user = this.config.Username;
		let pass = this.config.Password;

		// Check if credentials are not empty and decrypt stored password
		if (user !== '' && pass !== '') {
			this.getForeignObject('system.config', (err, obj) => {
				if (obj && obj.native && obj.native.secret) {
					//noinspection JSUnresolvedVariable
					pass = this.decrypt(obj.native.secret, pass);
				} else {
					//noinspection JSUnresolvedVariable
					pass = this.decrypt('Zgfr56gFe87jJOM', pass);
				}

				try {
					this.DoData_Refresh(user, pass);
				} catch (error) {
					this.log.error(error);
				}
			});
		} else {
			this.log.error('*** Adapter deactivated, credentials missing in Adaptper Settings !!!  ***');
			this.setForeignState('system.adapter.' + this.namespace + '.alive', false);
		}
	}

	async DoData_Refresh(user, pass) {
		const intervall_time = (this.config.intervall * 1000);
		let step = 'start';

		// Get login token
		try {
			step = 'login';
			await this.login(user, pass);
			const conn_state = await this.getStateAsync('info.connection');
			if (conn_state === undefined || conn_state === null) {
				return;
			} else {
				if (conn_state.val === false) {
					this.log.info('Connected to Tado cloud, initialyzing ... ');
				}
			}

			// Get Basic data needed for all other querys and store to global variable
			step = 'getMet_data';
			if (this.getMe_data === null) {
				this.getMe_data = await this.getMe();
			}
			this.log.debug('GetMe result : ' + JSON.stringify(this.getMe_data));
			//set timestamp for 'Online'-state
			await JsonExplorer.setLastStartTime();

			for (const i in this.getMe_data.homes) {
				this.DoWriteJsonRespons(this.getMe_data.homes[i].id, 'Stage_01_GetMe_Data', this.getMe_data);
				if (this.startprocedure) {
					step = 'DoHome';
					await this.DoHome(this.getMe_data.homes[i].id);
					step = 'DoDevices';
					await this.DoDevices(this.getMe_data.homes[i].id);
					step = 'DoMobileDevices';
					await this.DoMobileDevices(this.getMe_data.homes[i].id);
				}
				step = 'DoZones';
				await this.DoZones(this.getMe_data.homes[i].id);
				step = 'DoWeather';
				await this.DoWeather(this.getMe_data.homes[i].id);

				//set all outdated states to NULL
				step = 'Set to null';
				if (this.startprocedure) {
					await JsonExplorer.checkExpire(this.getMe_data.homes[i].id + '.*');
				} else {
					await JsonExplorer.checkExpire(this.getMe_data.homes[i].id + '.Rooms.*');
				}
			}

			if (conn_state === undefined || conn_state === null) {
				return;
			} else {

				if (conn_state.val === false) {
					this.log.info('Initialisation finished,  connected to Tado Cloud service refreshing every : ' + this.config.intervall + ' seconds');
					this.setState('info.connection', true, true);
				}
			}
			this.startprocedure = false;

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

	// Function to decrypt passwords
	// @ts-ignore
	decrypt(key, value) {
		let result = '';
		for (let i = 0; i < value.length; ++i) {
			result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
		}
		this.log.debug('client_secret decrypt ready');
		return result;
	}

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

	login(username, password) {
		return new Promise((resolve, reject) => {
			const credentials = {
				scope: 'home.user',
				username: username,
				password: password
			};
			oauth2.ownerPassword.getToken(credentials)
				.then(result => {
					this._accessToken = oauth2.accessToken.create(result);
					// const token = oauth2.accessToken.create(result);
					// JSON.stringify(result);
					// JSON.stringify(this._accessToken);
					resolve(this._accessToken);
				})
				.catch(error => {
					reject(error);
				});
		});
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

	// Function disabled, no data in API ?
	// getDevices(home_id) {
	// 	this.log.info('getDevices called')
	// 	return this.apiCall(`/api/v2/homes/${home_id}/devices`);
	// }

	// Function disabled, no data in API ?
	getInstallations(home_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/installations`);
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

	async clearZoneOverlay(home_id, zone_id) {
		await this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`, 'delete');
		await JsonExplorer.setLastStartTime();
		await this.DoZoneStates(home_id, zone_id);
		await JsonExplorer.checkExpire(home_id + '.Rooms.' + zone_id + '.overlay.*');
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
			//Temperature not for hot water devices and not for aircondition if mode is DRY, AUTO, FAN
			if (temperature && type != 'HOT_WATER' && mode != 'DRY' && mode != 'AUTO' && mode != 'FAN') {
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

		this.log.info(`Send API ZoneOverlay API call Home: ${home_id} zone : ${zone_id} config: ${JSON.stringify(config)}`);
		let result = await this.poolApiCall(home_id, zone_id, config);
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
				that.log.info(`API called with  ${JSON.stringify(config)}`);
				//that.DoConnect();
				//that.log.debug('Data refreshed (DoConnect()) called');
				resolve(apiResponse);
			}, 750);
		});
	}

	/*
	// Unclear purpose, ignore for now
	getZoneCapabilities(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/capabilities`);
	}*/

	/*
	// Unclear purpose, ignore for now
	getZoneOverlay(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`);
	}*/

	getTimeTables(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/schedule/activeTimetable`);
	}

	getTemperatureOffset(device_id) {
		return this.apiCall(`/api/v2/devices/${device_id}/temperatureOffset`);
	}

	/*
	// Coding break point of functionality
	getZoneDayReport(home_id, zone_id, reportDate) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/dayReport?date=${reportDate}`);
	} */

	// getTimeTable(home_id, zone_id, timetable_id) {
	// 	return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/schedule/timetables/${timetable_id}/blocks`);
	// }

	// identifyDevice(device_id) {
	// 	return this.apiCall(`/api/v2/devices/${device_id}/identify`, 'post');
	// }


	async DoHome(HomeId) {
		// Get additional basic data for all homes
		if (this.Home_data === null) {
			this.Home_data = await this.getHome(HomeId);
		}
		this.log.debug('Home_data Result : ' + JSON.stringify(this.Home_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_02_HomeData', this.Home_data);
		JsonExplorer.TraverseJson(this.Home_data, `${HomeId}.Home`, true, true, 0, 0);
	}

	async DoWeather(HomeId) {
		const weather_data = await this.getWeather(HomeId);
		this.log.debug('Weather_data Result : ' + JSON.stringify(weather_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_04_Weather', weather_data);
		JsonExplorer.TraverseJson(weather_data, `${HomeId}.Weather`, true, true, 0, 0);
	}

	async DoTemperatureOffset(HomeId, ZoneId, DeviceId) {
		const offset = await this.getTemperatureOffset(DeviceId);
		this.log.info(`Offset Result for DeviceID '${DeviceId}': ${JSON.stringify(offset)}`);
		this.DoWriteJsonRespons(HomeId, `Stage_99_Offset_${HomeId}`, offset);
		if (offset.celsius) offset.offsetCelsius = offset.celsius;
		if (offset.fahrenheit) offset.offsetFahrenheit = offset.fahrenheit;
		delete offset.celsius;
		delete offset.fahrenheit;
		JsonExplorer.TraverseJson(offset, `${HomeId}.Rooms.${ZoneId}.devices.${DeviceId}.offset`, true, true, 0, 2);
	}

	async DoDevices(HomeId) {
		const Devices_data = await this.getDevices(HomeId);
		this.log.debug('Users_data Result : ' + JSON.stringify(Devices_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_03_Devices', Devices_data);
	}

	/*
	async DoInstallations(HomeId) {
		const Installations_data = await this.getInstallations(HomeId);
		this.log.debug('Installations_data Result : ' + JSON.stringify(Installations_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_05_Installations', Installations_data);
	}*/


	// Function disabled, no data in API ?
	async DoStates(HomeId) {
		this.States_data = await this.getState_info(HomeId);
		this.log.debug('States_data Result : ' + JSON.stringify(this.States_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_14_StatesData', this.States_data);
	}

	// User information equal to Weather, ignoring function but keep for history/feature functionality
	// async DoUsers(HomeId){
	// 	const users_data = await this.getWeather(HomeId);
	// 	this.log.debug('Users_data Result : ' + JSON.stringify(users_data));
	// 	for (const i in users_data){
	// 	}
	// }

	async DoMobileDevices(HomeId) {
		this.MobileDevices_data = await this.getMobileDevices(HomeId);
		this.log.debug('MobileDevices_data Result : ' + JSON.stringify(this.MobileDevices_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_06_MobileDevicesData', this.MobileDevices_data);
		JsonExplorer.TraverseJson(this.MobileDevices_data, `${HomeId}.MobileDevices`, true, true, 0, 0);
	}

	async DoMobileDeviceSettings(HomeId, DeviceId) {
		const MobileDeviceSettings_data = await this.getMobileDeviceSettings(HomeId, DeviceId);
		this.log.debug('MobileDeviceSettings_Data Result : ' + JSON.stringify(MobileDeviceSettings_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_07_MobileDevicesSettings_' + DeviceId, MobileDeviceSettings_data);
		JsonExplorer.TraverseJson(MobileDeviceSettings_data, `${HomeId}.MobileDevices.${DeviceId}.setting`, true, true, 0, 2);
	}

	async DoZones(HomeId) {
		this.Zones_data = await this.getZones(HomeId);
		this.log.debug('Zones_data Result : ' + JSON.stringify(this.Zones_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_08_ZonesData', this.Zones_data);

		//Search for DeviceIDs to get Offset
		for (const j in this.Zones_data) {
			for (const k in this.Zones_data[j]) {
				for (const l in this.Zones_data[j][k]) {
					let ZoneId = this.Zones_data[j].id;
					let DeviceId = this.Zones_data[j][k][l].serialNo;
					if (DeviceId != undefined) {
						this.log.info('DeviceID found: ' + JSON.stringify(this.Zones_data[j][k][l].serialNo));
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
			//await this.DoTimeTables(HomeId, this.Zones_data[i].id);
		}
	}

	/*
	async DoUser(HomeId) {
		this.Users_data = await this.getZones(HomeId);
		this.log.debug('Users_data Result : ' + JSON.stringify(this.Users_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_15_ZonesData', this.Users_data);
	}*/

	/*
	//can be deleted?
	async DoReadDevices(state_root, Devices_data,) {
		this.log.debug('Devices_data Result : ' + JSON.stringify(Devices_data));
	}*/

	async DoZoneStates(HomeId, ZoneId) {
		const ZonesState_data = await this.getZoneState(HomeId, ZoneId);
		this.log.debug('ZoneStates_data Result for zone : ' + ZoneId + ' and value : ' + JSON.stringify(ZonesState_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_09_ZoneStates_data_' + ZoneId, ZonesState_data);
		ZonesState_data.overlayClearZone = false;
		JsonExplorer.TraverseJson(ZonesState_data, HomeId + '.Rooms.' + ZoneId, true, true, 0, 2);
	}

	/*
	// Unclear purpose, ignore for now
	async DoZoneCapabilities(HomeId, ZoneId) {
		const ZoneCapabilities_data = await this.getZoneCapabilities(HomeId, ZoneId);
		this.log.debug('ZoneCapabilities_data Result : ' + JSON.stringify(ZoneCapabilities_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_11_ZoneCapabilities_' + ZoneId, ZoneCapabilities_data);
	}*/

	/*
	// Unclear purpose, ignore for now only 404 error
	async DoZoneOverlay(HomeId, ZoneId) {
		const ZoneOverlay_data = await this.getZoneOverlay(HomeId, ZoneId);
		this.log.debug('ZoneOverlay_data Result : ' + JSON.stringify(ZoneOverlay_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_12_ZoneOverlay_' + ZoneId, ZoneOverlay_data);
	}*/

	async DoTimeTables(HomeId, ZoneId) {
		const TimeTables_data = await this.getTimeTables(HomeId, ZoneId);
		this.log.debug('ZoneOverlay_data Result : ' + JSON.stringify(TimeTables_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_13_TimeTables_' + ZoneId, TimeTables_data);
	}

	async DoAwayConfiguration(HomeId, ZoneId) {
		const AwayConfiguration_data = await this.getAwayConfiguration(HomeId, ZoneId);
		this.log.debug('AwayConfiguration_data Result : ' + JSON.stringify(AwayConfiguration_data));
		this.DoWriteJsonRespons(HomeId, 'Stage_10_AwayConfiguration_' + ZoneId, AwayConfiguration_data);
		JsonExplorer.TraverseJson(AwayConfiguration_data, HomeId + '.Rooms.' + ZoneId + '.AwayConfig', true, true, 0, 2);
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

	async DoWriteJsonRespons(HomeId, state_name, value) {
		if (this.log.level == 'debug' || this.log.level == 'silly') {
			this.log.debug('JSON data written for ' + state_name + ' with values : ' + JSON.stringify(value));
			this.log.debug('HomeId ' + HomeId + ' name : ' + state_name + state_name + ' value ' + JSON.stringify(value));

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

	async errorHandling(codePart, error) {
		this.log.error(`[${codePart}] error: ${error.message}, stack: ${error.stack}`);
		if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
			const sentryInstance = this.getPluginInstance('sentry');
			if (sentryInstance) {
				sentryInstance.getSentryObject().captureException(error);
			}
		}
	}
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
