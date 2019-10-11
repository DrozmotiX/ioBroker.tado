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
const oauth_path = '/oauth/token';
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
const axios = require('axios');
let getMe_data, Home_data;

// const fs = require("fs");

class Tado extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'tado',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
		this._accessToken = null;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {

		// Reset the connection indicator during startup
		// Info channel for Each Home
		await this.setObjectNotExistsAsync('._info', {
			type: 'channel',
			common: {
				name: 'Tado account and connection information',
			},
			native: {},
		});
		this.setState('_info.connection', false, true);

		const user = this.config.Username;
		let pass = this.config.Password;

		// Check if credentials are not empty and decrypt stored password
		if (user !== '' && pass !== ''){
			this.getForeignObject('system.config', (err, obj) => {
				if (obj && obj.native && obj.native.secret) {
				//noinspection JSUnresolvedVariable
					pass = this.decrypt(obj.native.secret, pass);
				} else {
				//noinspection JSUnresolvedVariable
					pass = this.decrypt('Zgfr56gFe87jJOM', pass);
				}
				this.log.info('Start initialisation');
				this.Doinitiate(user,pass);
			});

		} else {
			this.log.error('*** Adapter deactivated, credentials missing in Adaptper Settings !!!  ***');
			this.setForeignState('system.this.' + this.namespace + '.alive', false);
		}

	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info('cleaned everything up...');
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	async Doinitiate(user,pass){
		// this.log.info('Username : ' + user + ' Password : ' + pass);
		// Get login token
		try {
		
			const login = await this.login(user,pass);
			this.log.info('Connected to Tado cloud, initialyzing ... ');
			this.log.debug('Login Result' + JSON.stringify(login));

			// Get Basic data needed for all other querys and store to global variable
			getMe_data = await this.getMe();
			this.log.debug('GetMe result : ' + JSON.stringify(getMe_data));
			this.setState('info.connection', true, true);

			for (const i in getMe_data.homes) {

				// create device channel for each Home found in getMe
				await this.setObjectNotExistsAsync(getMe_data.homes[i].id, {
					type: 'device',
					common: {
						name: getMe_data.homes[i].name,
					},
					native: {},
				});
				
				// Write basic data to home specific info channel states
				await this.DoHome(getMe_data.homes[i].id);
				await this.DoWeather(getMe_data.homes[i].id);
				
				
				// this.getDevices(getMe_data.homes[i].id)
				// this.getInstallations(getMe_data.homes[i].id);	
				// await this.DoUsers(getMe_data.homes[i].id) 	// User information equal to Weather, ignoring function but keep for history/feature functionality
				// await this.DoStates(getMe_data.homes[i].id)
				
				
				await this.DoMobileDevices(getMe_data.homes[i].id);

			}

			this.log.info('Initialisation finished,  connected to Tado Cloud service.');

		} catch (error) {
			this.log.error('Unable to login, are you using the right credentials ?');
			this.setState('info.connection', false, true);
		}
	}

	// Function to decrypt passwords
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
					JSON.stringify(result);
					JSON.stringify(this._accessToken);
					resolve(this._accessToken);
				})
				.catch(error => {
					reject(error);
				});
		});
	}

	apiCall(url, method='get', data={}) {
		return new Promise((resolve, reject) => {
			if (this._accessToken) {
				this._refreshToken().then(() => {
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
	// getInstallations(home_id) {
	// 	this.log.info('getInstallations called')
	// 	return this.apiCall(`/api/v2/homes/${home_id}/installations`);
	// }

	// User information equal to Weather, ignoring function but keep for history/feature functionality
	// getUsers(home_id) {
	// 	return this.apiCall(`/api/v2/homes/${home_id}/users`);
	// }

	// Function disabled, no data in API ?
	// getState(home_id) {
	// 	return this.apiCall(`/api/v2/homes/${home_id}/state`);
	// }

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

	// Coding break point of functionality

	getZoneState(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/state`);
	}

	getZoneCapabilities(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/capabilities`);
	}

	getZoneOverlay(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`);
	}

	getZoneDayReport(home_id, zone_id, reportDate) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/dayReport?date=${reportDate}`);
	}

	getTimeTables(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/schedule/activeTimetable`);
	}

	getAwayConfiguration(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/awayConfiguration`);
	}

	getTimeTable(home_id, zone_id, timetable_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/schedule/timetables/${timetable_id}/blocks`);
	}

	clearZoneOverlay(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`, 'delete');
	}

	// Coding break point of functionality


	setZoneOverlay(home_id, zone_id, power, temperature, termination) {
		const config = {
			setting: {
				type: 'HEATING',
			},
			termination: {
			}
		};

		if (power.toLowerCase() == 'on') {
			config.setting.power = 'ON';

			if (temperature) {
				config.setting.temperature = {};
				config.setting.temperature.celsius = temperature;
			}
		} else {
			config.setting.power = 'OFF';
		}

		if (!isNaN(parseInt(termination))) {
			config.termination.type = 'TIMER';
			config.termination.durationInSeconds = termination;
		} else if(termination && termination.toLowerCase() == 'auto') {
			config.termination.type = 'TADO_MODE';
		} else {
			config.termination.type = 'MANUAL';
		}

		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`, 'put', config);
	}

	identifyDevice(device_id) {
		return this.apiCall(`/api/v2/devices/${device_id}/identify`, 'post');
	}

	// Non-Tado call functions
	writeZoneStates(HomeId, ZoneId, states){
		this.log.debug('ZoneStates Loop : ' + JSON.stringify(states));

		// Handle all values and write to states
		// for (const i in states){
		// 	this.log.debug('State loop : ' + i + ' with value : ' + states[i]);
		// 	switch (i) {

		// 		case ('link'):
		// 			this.create_state(HomeId + '.zones.' + ZoneId + '.' + i, i,states[i].state);
		// 		break;

		// 		case ('setting'):
		// 			this.create_state(HomeId + '.zones.' + ZoneId + '.' + i + '.type', i,states[i].type);
		// 			this.create_state(HomeId + '.zones.' + ZoneId + '.' + i + '.power', i,states[i].power);
		// 			this.create_state(HomeId + '.zones.' + ZoneId + '.' + i + '.temperature', i,states[i].temperature.celsius);
		// 			break;

		// 		case ('activityDataPoints'):
		// 				this.create_state(HomeId + '.zones.' + ZoneId + '.heatingPower', i, states[i]['heatingPower'].percentage);					


		// 		default:
		// 			this.create_state(HomeId + '.zones.' + ZoneId + '.' + i, i, states[i]);
				
		// 	}
				
		// }

	}

	async DoHome(HomeId){
		// Get additional basic data for all homes
		Home_data = await this.getHome(HomeId);
		this.log.debug('Home_data Result : ' + JSON.stringify(Home_data));
		for (const i in Home_data){
			this.log.debug('Home_data ' + i + ' with value : ' + JSON.stringify(Home_data[i]));
			// Info channel for Each Home
			await this.setObjectNotExistsAsync(HomeId + '._info', {
				type: 'channel',
				common: {
					name: 'Basic information',
				},
				native: {},
			});
			// if(Home_data[i] != 'null'){ ==> issue in IF repair later
			switch (i){

				case ('id'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);
					break;

				case ('name'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);
					break;

				case ('dateTimeZone'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);				
					break;		

				case ('dateCreated'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);
					break;		
						
				case ('temperatureUnit'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);
					break;		
						
				case ('installationCompleted'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);
					break;		
						
				case ('partner'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);
					break;		
						
				case ('simpleSmartScheduleEnabled'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);
					break;		

				case ('awayRadiusInMeters'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);
					break;		

				case ('skills'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);
					break;		
						
				case ('christmasModeEnabled'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);
					break;		
						
				case ('showAutoAssistReminders'):
					this.create_state(HomeId + '._info.' + i, i, Home_data[i]);
					break;		
						
				case ('contactDetails'):
					await this.setObjectNotExistsAsync(HomeId + '._info.contactDetails', {
						type: 'channel',
						common: {
							name: 'Contact Details',
						},
						native: {},
					});

					// handle all contact details and write to states
					for (const y in Home_data[i]){
						this.create_state(HomeId + '._info.contactDetails.' + y, y, Home_data[i][y]);
					}
			
					break;		
						
				case ('address'):
					await this.setObjectNotExistsAsync(HomeId + '._info.address', {
						type: 'channel',
						common: {
							name: 'Contact Details',
						},
						native: {},
					});

					// handle all adress details and write to states
					for (const y in Home_data[i]){
						this.create_state(HomeId + '._info.address.' + y, y, Home_data[i][y]);
					}
					break;		
						
				case ('geolocation'):
					this.create_state(HomeId + '._info.latitude', i, Home_data[i].latitude);
					this.create_state(HomeId + '._info.longitude', i, Home_data[i].longitude);
				
					break;		

				case ('consentGrantSkippable'):
				
					break;

				default:
					this.log.error('Send this info to developer !!! { Unhandable information found in DoHome : ' + JSON.stringify(i) + ' with value : ' + Home_data[i]);


			}
			// }
		}
		
	}

	async DoWeather(HomeId){
		const weather_data = await this.getWeather(HomeId);
		this.log.debug('Weather_data Result : ' + JSON.stringify(weather_data));
		for (const i in weather_data){
			this.log.debug('Weather' + i + ' with value : ' + JSON.stringify(weather_data[i]));
			// Info channel for Each Home
			await this.setObjectNotExistsAsync(HomeId + '.Weather', {
				type: 'channel',
				common: {
					name: 'Local weather conditions',
				},
				native: {},
			});

			switch (i){

				case ('outsideTemperature'):
					this.create_state(HomeId + '.Weather.' + i, i, weather_data[i].celsius);
					break;

				case ('solarIntensity'):
					this.create_state(HomeId + '.Weather.' + i, i, weather_data[i].percentage);
					break;

				case ('weatherState'):
					this.create_state(HomeId + '.Weather.' + i, i, weather_data[i].value);
					break;

				default:
					this.log.error('Send this info to developer !!! { Unhandable information found in DoHWeather : ' + JSON.stringify(i) + ' with value : ' + weather_data[i]);

			}	
		}					

	}

	// Function disabled, no data in API ?
	// async DoUsers(HomeId){
	// 	const Users_data = await this.getWeather(HomeId);
	// 	this.log.info('Users_data Result : ' + JSON.stringify(Users_data));
	// }

	// Function disabled, no data in API ?
	// async DoStates(HomeId){
	// 	const States_data = await this.getState(HomeId);
	// 	this.log.info('States_data Result : ' + JSON.stringify(States_data));				
	// }

	// User information equal to Weather, ignoring function but keep for history/feature functionality
	// async DoUsers(HomeId){
	// 	const users_data = await this.getWeather(HomeId);
	// 	this.log.debug('Users_data Result : ' + JSON.stringify(users_data));
	// 	for (const i in users_data){
	// 	}
	// }

	async DoMobileDevices(HomeId){
		const MobileDevices_data = await this.getMobileDevices(HomeId);
		this.log.debug('MobileDevices_data Result : ' + JSON.stringify(MobileDevices_data));

		for (const i in MobileDevices_data){
			this.log.debug('Mobiel Device' + i + ' with value : ' + JSON.stringify(MobileDevices_data[i]));
			// // Info channel for Each Home
			await this.setObjectNotExistsAsync(HomeId + '.Mobile_Devices', {
				type: 'channel',
				common: {
					name: 'Mobile devices connected to Tado',
				},
				native: {},
			});

			// Info channel for Each Home
			await this.setObjectNotExistsAsync(HomeId + '.Mobile_Devices.' + MobileDevices_data[i].id, {
				type: 'channel',
				common: {
					name: MobileDevices_data[i].name,
				},
				native: {},
			});

			for ( const y in MobileDevices_data[i]){
				this.log.debug('Mobiel Device' + y + ' with value : ' + JSON.stringify(MobileDevices_data[i][y]));

				switch (y){

					case ('name'):
						this.create_state(HomeId + '.Mobile_Devices.' + MobileDevices_data[i].id + '.' + y, y, MobileDevices_data[i][y]);
						break;

					case ('id'):
						this.create_state(HomeId + '.Mobile_Devices.' + MobileDevices_data[i].id + '.' + y, y, MobileDevices_data[i][y]);
						break;

					case ('settings'):
						this.create_state(HomeId + '.Mobile_Devices.' + MobileDevices_data[i].id + '.geoTrackingEnabled', y, MobileDevices_data[i][y].geoTrackingEnabled);
						break;

					case ('deviceMetadata'):
						this.create_state(HomeId + '.Mobile_Devices.' + MobileDevices_data[i].id + '.locale', 'locale', MobileDevices_data[i][y].locale);
						this.create_state(HomeId + '.Mobile_Devices.' + MobileDevices_data[i].id + '.model', 'model', MobileDevices_data[i][y].model);
						this.create_state(HomeId + '.Mobile_Devices.' + MobileDevices_data[i].id + '.osVersion', 'osVersion', MobileDevices_data[i][y].osVersion);
						this.create_state(HomeId + '.Mobile_Devices.' + MobileDevices_data[i].id + '.platform', 'platform', MobileDevices_data[i][y].platform);						
						break;

					case ('location'):
						this.create_state(HomeId + '.Mobile_Devices.' + MobileDevices_data[i].id + '.stale', 'stale', MobileDevices_data[i][y].stale);
						this.create_state(HomeId + '.Mobile_Devices.' + MobileDevices_data[i].id + '.atHome', 'atHome', MobileDevices_data[i][y].atHome);
						this.create_state(HomeId + '.Mobile_Devices.' + MobileDevices_data[i].id + '.distance', 'distance', MobileDevices_data[i][y].relativeDistanceFromHomeFence);
						break;
					

					default:
						this.log.error('Send this info to developer !!! { Unhandable information found in DoMobile_Devices : ' + JSON.stringify(y) + ' with value : ' + JSON.stringify(MobileDevices_data[i][y]));
				}
			}
			await this.DoMobileDeviceSettings(HomeId,MobileDevices_data[i].id);		
		}	
	
	}

	async DoMobileDeviceSettings(HomeId,DeviceId){
		const MobileDeviceSettings_data = await this.getMobileDeviceSettings(HomeId,DeviceId);
		this.log.debug('MobileDeviceSettings_Data Result : ' + JSON.stringify(MobileDeviceSettings_data));
		// device setting channel for Each Home
		await this.setObjectNotExistsAsync(HomeId + '.Mobile_Devices.' + DeviceId +  '.Device_Setting', {
			type: 'channel',
			common: {
				name: 'Mobile devices settings',
			},
			native: {},
		});
		for (const i in  MobileDeviceSettings_data) {
			switch (i){

				case ('geoTrackingEnabled'):
					this.create_state(HomeId + '.Mobile_Devices.' + DeviceId +  '.Device_Setting.' +  i, i, MobileDeviceSettings_data[i]);
					break;
				
				case ('pushNotifications'):
					await this.setObjectNotExistsAsync(HomeId + '.Mobile_Devices.' + DeviceId +  '.Device_Setting.' + i, {
						type: 'channel',
						common: {
							name: i,
						},
						native: {},
					});
					for (const y in MobileDeviceSettings_data[i]){
						this.create_state(HomeId + '.Mobile_Devices.' + DeviceId +  '.Device_Setting.' + i + '.' + y, y, MobileDeviceSettings_data[i][y]);
					}

					break;

				default:
					this.log.error('Send this info to developer !!! { Unhandable information found in DoMobileDeviceSettings : ' + JSON.stringify(i) + ' with value : ' + JSON.stringify(MobileDeviceSettings_data[i]));

			}

		}

	}

	async create_state(state, name, value){
		this.log.debug('Create_state called for : ' + state + ' with value : ' + value);
		await this.setObjectNotExistsAsync(state, {
			type: 'state',
			common: {
				name: name,
				read : true,
				write : false
			},
			native: {},
		});
		await this.setState(state, {val: value, ack: true});
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