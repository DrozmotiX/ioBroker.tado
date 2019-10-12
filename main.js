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
const state_attr = require(__dirname + '/lib/state_attr.js');
const axios = require('axios');
let polling; // Polling timer

// const fs = require('fs');

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
		this.getMe_data = null;
		this.Home_data =  null;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {

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
			if (state.ack === false) {

				// const deviceId = id.split('.');
				const deviceId = id.split('.');
				// let stateNameToSend = '';
				for (const x in deviceId){
					this.log.debug('Device id channel : ' + deviceId[x]);
					switch (deviceId[x]) {

						case ('clearZoneOverlay'):
							this.log.warn('Overlay cleared for zone : ' + deviceId[4] + ' in home : ' + deviceId[2]);
							this.clearZoneOverlay(deviceId[2],deviceId[4]);
							this.DoConnect()

							break;

						default:

					}

				}

				this.log.debug('State change detected from different source then adapter');
				this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
				
			}  else {
				this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			}


		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	async DoConnect(){
		// this.log.info('Username : ' + user + ' Password : ' + pass);

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
				
				try {
					this.DoData_Refresh(user,pass);
				} catch (error) {
					this.log.error(error);
				}
			});

		} else {
			this.log.error('*** Adapter deactivated, credentials missing in Adaptper Settings !!!  ***');
			this.setForeignState('system.this.' + this.namespace + '.alive', false);
		}

	}

	async DoData_Refresh(user,pass){

		const intervall_time = (this.config.intervall * 1000);

		// Get login token
		try {
		
			await this.login(user,pass);
			
			const conn_state = await this.getStateAsync('info.connection');
			if (conn_state === undefined || conn_state === null) {
				return;
			}  else {

				if (conn_state.val === false) {

					this.log.info('Connected to Tado cloud, initialyzing ... ');
					
				}

			}

			// Get Basic data needed for all other querys and store to global variable
			this.getMe_data = await this.getMe();
			this.log.debug('GetMe result : ' + JSON.stringify(this.getMe_data));

			for (const i in this.getMe_data.homes) {

				// create device channel for each Home found in getMe
				await this.setObjectNotExistsAsync(this.getMe_data.homes[i].id, {
					type: 'device',
					common: {
						name: this.getMe_data.homes[i].name,
					},
					native: {},
				});
				
				// Write basic data to home specific info channel states
				await this.DoHome(this.getMe_data.homes[i].id);
				await this.DoWeather(this.getMe_data.homes[i].id);
				
				
				// this.getDevices(this.getMe_data.homes[i].id)
				// this.getInstallations(this.getMe_data.homes[i].id);	
				// await this.DoUsers(this.getMe_data.homes[i].id) 	// User information equal to Weather, ignoring function but keep for history/feature functionality
				// await this.DoStates(this.getMe_data.homes[i].id)
				
				this.log.silly('Get all mobile devices');
				try {
					await this.DoMobileDevices(this.getMe_data.homes[i].id);
				} catch (error) {
					this.log.silly('Issue in Get all mobile devices' + error);
				}
				
				this.log.silly('Get all rooms');
				try {
					
					await this.DoZones(this.getMe_data.homes[i].id);
				} catch (error) {
					this.log.error('Issue in Get all rooms' + error);
				}
			}


			if (conn_state === undefined || conn_state === null) {
				return;
			}  else {

				if (conn_state.val === false) {

					this.log.info('Initialisation finished,  connected to Tado Cloud service refreshing every : ' + this.config.intervall + ' seconds');
					this.setState('info.connection', true, true);
					
				}

			}

			// Clear running timer
			(function () {if (polling) {clearTimeout(polling); polling = null;}})();
			// timer
			polling = setTimeout( () => {
				this.DoConnect();
			}, intervall_time);



			

		} catch (error) {
			this.log.error('Disconnected from Tado cloud service ..., retry in 30 seconds ! ');
			this.setState('info.connection', false, true);
			// retry connection
			polling = setTimeout( () => {
				this.DoConnect();
			}, 30000);
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

	getAwayConfiguration(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/awayConfiguration`);
	}

	clearZoneOverlay(home_id, zone_id) {
		return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`, 'delete');
	}

	// Unclear purpose, ignore for now
	// getZoneCapabilities(home_id, zone_id) {
	// 	return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/capabilities`);
	// }

	// Unclear purpose, ignore for now
	// getZoneOverlay(home_id, zone_id) {
	// 	return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`);
	// }

	/*	######## To-Do ########
	// Coding break point of functionality
	// getZoneDayReport(home_id, zone_id, reportDate) {
	// 	return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/dayReport?date=${reportDate}`);
	// }

	// getTimeTables(home_id, zone_id) {
	// 	return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/schedule/activeTimetable`);
	// }

	// getTimeTable(home_id, zone_id, timetable_id) {
	// 	return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/schedule/timetables/${timetable_id}/blocks`);
	// }

	// setZoneOverlay(home_id, zone_id, power, temperature, termination) {
	// 	const config = {
	// 		setting: {
	// 			type: 'HEATING',
	// 		},
	// 		termination: {
	// 		}
	// 	};

	// 	if (power.toLowerCase() == 'on') {
	// 		config.setting.power = 'ON';

	// 		if (temperature) {
	// 			config.setting.temperature = {};
	// 			config.setting.temperature.celsius = temperature;
	// 		}
	// 	} else {
	// 		config.setting.power = 'OFF';
	// 	}

	// 	if (!isNaN(parseInt(termination))) {
	// 		config.termination.type = 'TIMER';
	// 		config.termination.durationInSeconds = termination;
	// 	} else if(termination && termination.toLowerCase() == 'auto') {
	// 		config.termination.type = 'TADO_MODE';
	// 	} else {
	// 		config.termination.type = 'MANUAL';
	// 	}

	// 	return this.apiCall(`/api/v2/homes/${home_id}/zones/${zone_id}/overlay`, 'put', config);
	// }

	// identifyDevice(device_id) {
	// 	return this.apiCall(`/api/v2/devices/${device_id}/identify`, 'post');
	// }
	*/
	async DoHome(HomeId){
		// Get additional basic data for all homes
		this.Home_data = await this.getHome(HomeId);
		this.log.debug('Home_data Result : ' + JSON.stringify(this.Home_data));
		for (const i in this.Home_data){
			this.log.debug('Home_data ' + i + ' with value : ' + JSON.stringify(this.Home_data[i]));
			// Info channel for Each Home
			await this.setObjectNotExistsAsync(HomeId + '._info', {
				type: 'channel',
				common: {
					name: 'Basic information',
				},
				native: {},
			});
			// if(this.Home_data[i] != 'null'){ ==> issue in IF repair later
			switch (i){

				case ('id'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);
					break;

				case ('name'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);
					break;

				case ('dateTimeZone'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);				
					break;		

				case ('dateCreated'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);
					break;		
						
				case ('temperatureUnit'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);
					break;		
						
				case ('installationCompleted'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);
					break;		
						
				case ('partner'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);
					break;		
						
				case ('simpleSmartScheduleEnabled'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);
					break;		

				case ('awayRadiusInMeters'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);
					break;		

				case ('skills'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);
					break;		
						
				case ('christmasModeEnabled'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);
					break;		
						
				case ('showAutoAssistReminders'):
					this.create_state(HomeId + '._info.' + i, i, this.Home_data[i]);
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
					for (const y in this.Home_data[i]){
						this.create_state(HomeId + '._info.contactDetails.' + y, y, this.Home_data[i][y]);
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
					for (const y in this.Home_data[i]){
						this.create_state(HomeId + '._info.address.' + y, y, this.Home_data[i][y]);
					}
					break;		
						
				case ('geolocation'):
					this.create_state(HomeId + '._info.latitude', i, this.Home_data[i].latitude);
					this.create_state(HomeId + '._info.longitude', i, this.Home_data[i].longitude);
				
					break;		

				case ('consentGrantSkippable'):
				
					break;

				default:
					this.log.error('Send this info to developer !!! { Unhandable information found in DoHome : ' + JSON.stringify(i) + ' with value : ' + this.Home_data[i]);


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
		this.MobileDevices_data = await this.getMobileDevices(HomeId);
		this.log.debug('MobileDevices_data Result : ' + JSON.stringify(this.MobileDevices_data));

		for (const i in this.MobileDevices_data){
			this.log.debug('Mobiel Device' + i + ' with value : ' + JSON.stringify(this.MobileDevices_data[i]));
			// // Info channel for Each Home
			await this.setObjectNotExistsAsync(HomeId + '.Mobile_Devices', {
				type: 'channel',
				common: {
					name: 'Mobile devices connected to Tado',
				},
				native: {},
			});

			// Info channel for Each Home
			await this.setObjectNotExistsAsync(HomeId + '.Mobile_Devices.' + this.MobileDevices_data[i].id, {
				type: 'channel',
				common: {
					name: this.MobileDevices_data[i].name,
				},
				native: {},
			});

			for ( const y in this.MobileDevices_data[i]){
				this.log.debug('Mobiel Device' + y + ' with value : ' + JSON.stringify(this.MobileDevices_data[i][y]));

				switch (y){

					case ('name'):
						this.create_state(HomeId + '.Mobile_Devices.' + this.MobileDevices_data[i].id + '.' + y, y, this.MobileDevices_data[i][y]);
						break;

					case ('id'):
						this.create_state(HomeId + '.Mobile_Devices.' + this.MobileDevices_data[i].id + '.' + y, y, this.MobileDevices_data[i][y]);
						break;

					case ('settings'):
						this.create_state(HomeId + '.Mobile_Devices.' + this.MobileDevices_data[i].id + '.geoTrackingEnabled', y, this.MobileDevices_data[i][y].geoTrackingEnabled);
						break;

					case ('deviceMetadata'):
						this.create_state(HomeId + '.Mobile_Devices.' + this.MobileDevices_data[i].id + '.locale', 'locale', this.MobileDevices_data[i][y].locale);
						this.create_state(HomeId + '.Mobile_Devices.' + this.MobileDevices_data[i].id + '.model', 'model', this.MobileDevices_data[i][y].model);
						this.create_state(HomeId + '.Mobile_Devices.' + this.MobileDevices_data[i].id + '.osVersion', 'osVersion', this.MobileDevices_data[i][y].osVersion);
						this.create_state(HomeId + '.Mobile_Devices.' + this.MobileDevices_data[i].id + '.platform', 'platform', this.MobileDevices_data[i][y].platform);						
						break;

					case ('location'):
						if (this.MobileDevices_data[i][y].stale === undefined || this.MobileDevices_data[i][y].stale === null) {
							return;
						}  else {
							this.create_state(HomeId + '.Mobile_Devices.' + this.MobileDevices_data[i].id + '.stale', 'stale', this.MobileDevices_data[i][y].stale);
						}
						
						this.create_state(HomeId + '.Mobile_Devices.' + this.MobileDevices_data[i].id + '.atHome', 'atHome', this.MobileDevices_data[i][y].atHome);
						this.create_state(HomeId + '.Mobile_Devices.' + this.MobileDevices_data[i].id + '.distance', 'distance', this.MobileDevices_data[i][y].relativeDistanceFromHomeFence);
						break;
					

					default:
						this.log.error('Send this info to developer !!! { Unhandable information found in DoMobile_Devices : ' + JSON.stringify(y) + ' with value : ' + JSON.stringify(this.MobileDevices_data[i][y]));
				}
			}
			await this.DoMobileDeviceSettings(HomeId,this.MobileDevices_data[i].id);		
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

	async DoZones(HomeId){
		this.Zones_data = await this.getZones(HomeId);
		this.log.debug('Zones_data Result : ' + JSON.stringify(this.Zones_data ));

		await this.setObjectNotExistsAsync(HomeId + '.Rooms', {
			type: 'channel',
			common: {
				name: 'Rooms',
			},
			native: {},
		});

		for (const i in  this.Zones_data ) {

			await this.setObjectNotExistsAsync(HomeId + '.Rooms.' + this.Zones_data [i].id, {
				type: 'channel',
				common: {
					name: this.Zones_data [i].name,
				},
				native: {},
			});

			await this.setObjectNotExistsAsync(HomeId + '.Rooms.' + this.Zones_data [i].id + '.info', {
				type: 'channel',
				common: {
					name: 'info',
				},
				native: {},
			});


			for (const y in this.Zones_data [i]){

				const state_root  = HomeId + '.Rooms.' + this.Zones_data [i].id +  '.info.' +  y;

				switch (y){
					
					case ('id'):
						// ignore id, no added value in state
						// this.create_state(state_root, y, this.Zones_data [i][y]);
						break;

					case ('name'):
						// ignore name, no added value in state
						// this.create_state(state_root, y, this.Zones_data [i][y]);
						break;
					
					case ('dateCreated'):

						await this.create_state(state_root, y, this.Zones_data [i][y]);
						break;

					case ('dazzleEnabled'):
				
						await this.create_state(state_root, y, this.Zones_data [i][y]);
						break;

					case ('dazzleMode'):
	
						await this.setObjectNotExistsAsync(HomeId + '.Rooms.' + this.Zones_data [i].id +  '.' +  y, {
							type: 'channel',
							common: {
								name: y,
							},
							native: {},
						});

						for (const x in this.Zones_data [i][y]){
							this.create_state(HomeId + '.Rooms.' + this.Zones_data [i].id +  '.' +  y +'.' + x, y, this.Zones_data [i][y][x]);
						}
						break;

					case ('devices'):
						await this.DoReadDevices(HomeId + '.Rooms.' + this.Zones_data [i].id +  '.' +  y,this.Zones_data [i][y]);
						break;
					
					case ('deviceTypes'):

						// await this.setObjectNotExistsAsync(state_root, {
						// 	type: 'channel',
						// 	common: {
						// 		name: y,
						// 	},
						// 	native: {},
						// });

						break;

					case ('openWindowDetection'):
				
						await this.setObjectNotExistsAsync(HomeId + '.Rooms.' + this.Zones_data [i].id +  '.' +  y, {
							type: 'channel',
							common: {
								name: y,
							},
							native: {},
						});

						for (const x in this.Zones_data [i][y]){
							// this.log.info(x + '   |   ' + y)
							this.create_state(HomeId + '.Rooms.' + this.Zones_data [i].id +  '.' +  y + '.' + x, x, this.Zones_data [i][y][x]);
						}
						break;
					
					case ('reportAvailable'):
			
						this.create_state(state_root, y, this.Zones_data [i][y]);
						break;

					case ('supportsDazzle'):
				
						this.create_state(state_root, y, this.Zones_data [i][y]);
						break;
					
					case ('type'):
			
						this.create_state(state_root, y, this.Zones_data [i][y]);
						break;
						

					default:
						this.log.error('Send this info to developer !!! { Unhandable information found in DoZones : ' + JSON.stringify(y) + ' with value : ' + JSON.stringify(this.Zones_data [i][y]));
				}
			}
			const basic_tree = HomeId + '.Rooms.' + this.Zones_data [i].id;
			await this.DoZoneStates(HomeId, this.Zones_data [i].id, basic_tree);
			// Unclear purpose, ignore for now
			// await this.DoZoneCapabilities(HomeId, this.Zones_data [i].id, basic_tree);
			// await this.DoZoneOverlay(HomeId, this.Zones_data [i].id, basic_tree);
			await this.DoAwayConfiguration(HomeId, this.Zones_data [i].id, basic_tree);

		}
	}

	async DoReadDevices(state_root,Devices_data, ){
		this.log.debug('Devices_data Result : ' + JSON.stringify(Devices_data));

		await this.setObjectNotExistsAsync(state_root, {
			type: 'channel',
			common: {
				name: 'Devices',
			},
			native: {},
		});

		for (const i in Devices_data){

			await this.setObjectNotExistsAsync(state_root +  '.' + Devices_data[i].serialNo, {
				type: 'channel',
				common: {
					name: Devices_data[i].deviceType,
				},
				native: {},
			});

			for (const y in Devices_data[i]){

				const state_root_device  = state_root +  '.' + Devices_data[i].serialNo  + '.info';
				switch (y){
					
					case ('batteryState'):
						this.create_state(state_root_device + '.' + y, y, Devices_data[i][y]);
						break;

					case ('characteristics'):
						// await this.setObjectNotExistsAsync(state_root + y, {
						// 	type: 'channel',
						// 	common: {
						// 		name: y,
						// 	},
						// 	native: {},
						// });
					
						// for (const x in Devices_data[i][y]){
						// 	this.create_state(state_root + '.duties.' + x, y, Devices_data[i][y][x]);
						// }
						break;	

					case ('connectionState'):
						this.create_state(state_root_device + '.' + y, y, Devices_data[i][y].value);
						break;						
					
					case ('currentFwVersion'):
						this.create_state(state_root_device + '.' + y, y, Devices_data[i][y]);
						break;

					case ('deviceType'):
						this.create_state(state_root_device + '.' + y, y, Devices_data[i][y]);
						break;

					case ('duties'):
						await this.setObjectNotExistsAsync(state_root_device +  '.'  + y, {
							type: 'channel',
							common: {
								name: y,
							},
							native: {},
						});
						
						for (const x in Devices_data[i][y]){
							this.create_state(state_root_device + '.' + y + '.' + x, y, Devices_data[i][y][x]);
						}
						break;					

					case ('mountingState'):
						this.create_state(state_root_device + '.' + y, y, Devices_data[i][y].value);
						break;						

					case ('serialNo'):
						this.create_state(state_root_device + '.' + y, y, Devices_data[i][y]);
						break;

					case ('shortSerialNo'):
						this.create_state(state_root_device + '.' + y, y, Devices_data[i][y]);
						break;

					default:
						this.log.error('Send this info to developer !!! { Unhandable information found in DoReadDevices : ' + JSON.stringify(y) + ' with value : ' + JSON.stringify(Devices_data[i][y]));
				}
			}
		}

	}

	async DoZoneStates(HomeId,ZoneId, state_root_states){
		const ZonesState_data = await this.getZoneState(HomeId, ZoneId);
		this.log.debug('ZoneStates_data Result : ' + JSON.stringify(ZonesState_data));

		for (const i in ZonesState_data){

			switch (i){
				
				case ('activityDataPoints'):
					this.create_state(state_root_states + '.heatingPower', 'heatingPower', ZonesState_data[i].heatingPower.percentage);
					break;

				case ('geolocationOverride'):
					this.create_state(state_root_states + '.' + i, i, state_root_states[i]);
					break;						


				case ('geolocationOverrideDisableTime'):
					this.create_state(state_root_states + '.' + i, i, ZonesState_data[i]);
					break;				

				case ('link'):
					this.create_state(state_root_states + '.' + i, i, ZonesState_data[i].state);
					break;

				case ('nextScheduleChange'):
					this.create_state(state_root_states + '.' + i, i, JSON.stringify(ZonesState_data[i]));
					break;

				case ('nextTimeBlock'):
					this.create_state(state_root_states + '.' + i, i, JSON.stringify(ZonesState_data[i]));
					break;

				case ('openWindow'):
					this.create_state(state_root_states + '.' + i, i, ZonesState_data[i]);
					break;						


				case ('overlay'):

					this.log.debug('API data of overlay : ' + JSON.stringify(ZonesState_data[i]));
					this.log.debug('API data : ' + JSON.stringify(ZonesState_data[i]));
					await this.setObjectNotExistsAsync(state_root_states + '.' + i, {
						type: 'channel',
						common: {
							name: i,
						},
						native: {},
					});

					this.create_state(state_root_states + '.' + i  + '.clearZoneOverlay', 'clearZoneOverlay', '');
				
					for (const x in ZonesState_data[i]){
						
						switch (x){

							case ('type'):
								this.create_state(state_root_states + '.' + i  + '.' + x, x, JSON.stringify(ZonesState_data[i][x]));
								break;	

							case ('setting'):

								for (const y in ZonesState_data[i]){

									try {

										await this.setObjectNotExistsAsync(state_root_states + '.' + i  + '.' + x, {
											type: 'channel',
											common: {
												name: x,
											},
											native: {},
										});
			
										switch (y){
				
											case ('temperature'): 
												if (ZonesState_data[i][x][y].celsius === null) {
													this.create_state(state_root_states + '.' + i  + '.' + x + '.' + y, y, null);
												} else {
													this.create_state(state_root_states + '.' + i  + '.' + x + '.' + y, y, ZonesState_data[i][x][y].celsius);
												}
											
												break;

											case ('type'):
												this.create_state(state_root_states + '.' + i  + '.' + x + '.' + y, y, ZonesState_data[i][x][y]);

												break;

											case ('power'):
												this.create_state(state_root_states + '.' + i  + '.' + x + '.' + y, y, ZonesState_data[i][x][y]);

												break;

											default:

										}		

									} catch (error) {
										// this.log.error(error);
					
									}
								}
								break;	
		
							case ('termination'):
								for (const y in ZonesState_data[i][x]){

									try {

										await this.setObjectNotExistsAsync(state_root_states + '.' + i  + '.' + x, {
											type: 'channel',
											common: {
												name: y,
											},
											native: {},
										});
			
										switch (y){
											
											case ('projectedExpiry'):
												this.create_state(state_root_states + '.' + i  + '.' + x + '.' + y, y, ZonesState_data[i][x][y]);

												break;


											case ('type'):
												this.create_state(state_root_states + '.' + i  + '.' + x + '.' + y, y, ZonesState_data[i][x][y]);

												break;

											case ('typeSkillBasedApp'):
												this.create_state(state_root_states + '.' + i  + '.' + x + '.' + y, y, ZonesState_data[i][x][y]);

												break;

											case ('remainingTimeInSeconds'):
												this.create_state(state_root_states + '.' + i  + '.' + x + '.' + y, y, ZonesState_data[i][x][y]);

												break;
											
											case ('durationInSeconds'):
												this.create_state(state_root_states + '.' + i  + '.' + x + '.' + y, y, ZonesState_data[i][x][y]);

												break;
								
											case ('expiry'):
												this.create_state(state_root_states + '.' + i  + '.' + x + '.' + y, y, ZonesState_data[i][x][y]);

												break;
															

											default:
												this.log.error('Send this info to developer !!! { Unhandable information found in DoReadDevices overlay termination : ' + JSON.stringify(y) + ' with value : ' + JSON.stringify(ZonesState_data[i][x][y]));

										}

									} catch (error) {
										this.log.error(error);
					
									}
								}
								break;	


							default:
								this.log.error('Send this info to developer !!! { Unhandable information found in DoReadDevices overlay : ' + JSON.stringify(i) + ' with value : ' + JSON.stringify(ZonesState_data[i]));
						}

					}

					this.create_state(state_root_states + '.' + i, i, JSON.stringify(ZonesState_data[i]));
					break;

				case ('overlayType'):
					this.create_state(state_root_states + '.' + i, i, JSON.stringify(ZonesState_data[i]));
					break;						
										
				case ('preparation'):
					this.create_state(state_root_states + '.' + i, i, ZonesState_data[i]);
					break;

				case ('sensorDataPoints'):
					this.create_state(state_root_states + '.' + 'Actual_Temperature', 'Actual_Temperature', ZonesState_data[i].insideTemperature.celsius);
					this.create_state(state_root_states + '.' + 'Actual_Humidity', 'Actual_Humidity', ZonesState_data[i].humidity.percentage);
					break;		

				case ('setting'):
					this.log.debug('ZoneStates_data settings Result : ' + JSON.stringify(ZonesState_data[i]));
					await this.setObjectNotExistsAsync(state_root_states + '.' + i, {
						type: 'channel',
						common: {
							name: i,
						},
						native: {},
					});

					for (const y in ZonesState_data[i]){

						try {

							if (y === 'temperature') {
								if (ZonesState_data[i][y].celsius === null) {
									this.create_state(state_root_states + '.' + i + '.' + y, y, null);
								} else {
									this.create_state(state_root_states + '.' + i + '.' + y, y, ZonesState_data[i][y].celsius);
								}
							} else {
								this.create_state(state_root_states + '.' + i + '.' + y, y, ZonesState_data[i][y]);
							}

						} catch (error) {
							// this.log.error(error);
		
						}
					}
					break;	


				case ('tadoMode'):
					this.create_state(state_root_states + '.' + i, i, ZonesState_data[i]);
					break;	
					
				default:
					this.log.error('Send this info to developer !!! { Unhandable information found in DoReadDevices : ' + JSON.stringify(i) + ' with value : ' + JSON.stringify(ZonesState_data[i]));
			}
		}

	}

	// Unclear purpose, ignore for now
	// async DoZoneCapabilities(HomeId,ZoneId, state_root_states){
	// 	const ZoneCapabilities_data = await this.getZoneCapabilities(HomeId, ZoneId);
	// 	this.log.debug('ZoneCapabilities_data Result : ' + JSON.stringify(ZoneCapabilities_data));
	// }

	// Unclear purpose, ignore for now
	// async DoZoneOverlay(HomeId,ZoneId, state_root_states){
	// 	try {
			
	// 		const ZoneOverlay_data = await this.getZoneOverlay(HomeId, ZoneId);
	// 		this.log.info('ZoneZoneOverlay_data Result : ' + JSON.stringify(ZoneOverlay_data));

	// 	} catch (error) {
	// 		this.log.error(error);
	// 	}
	// }

	async DoAwayConfiguration(HomeId,ZoneId, state_root_states){
		const AwayConfiguration_data = await this.getAwayConfiguration(HomeId, ZoneId);
		this.log.debug('AwayConfiguration_data Result : ' + JSON.stringify(AwayConfiguration_data));

		for (const i in AwayConfiguration_data){

			switch (i){
				
				case ('minimumAwayTemperature'):
					this.create_state(state_root_states + '.AwayConfiguration.' + i	, i, AwayConfiguration_data[i].celsius);
					break;
				case ('preheatingLevel'):
					this.create_state(state_root_states + '.AwayConfiguration.' + i, i, AwayConfiguration_data[i]);
					break;
				case ('type'):
					this.create_state(state_root_states + '.AwayConfiguration.' + i, i, AwayConfiguration_data[i]);
					break;

				default:
					this.log.error('Send this info to developer !!! { Unhandable information found in DoAwayConfiguration : ' + JSON.stringify(i) + ' with value : ' + JSON.stringify(AwayConfiguration_data[i]));
			}
		}
	}

	async create_state(state, name, value){
		this.log.debug('Create_state called for : ' + state + ' with value : ' + value);
		this.log.debug('Create_state called for : ' + name	 + ' with value : ' + value);
		const intervall_time = (this.config.intervall * 2);
		if (state_attr[name] !==  undefined) {
			await this.setObjectNotExistsAsync(state, {
				type: 'state',
				common: {
					name: state_attr[name].name,
					role: state_attr[name].role,
					type: state_attr[name].type,
					unit: state_attr[name].unit,
					read : true,
					write : state_attr[name].write
				},
				native: {},
			});
			await this.setState(state, {val: value, ack: true, expire: intervall_time });

			// if state has writable flag yes, subscribe on changes

			if (state_attr[name].write === true) {
				this.subscribeStates(state);
				this.log.debug('State subscribed!: ' + state);
			}
			

		} else {
			this.log.debug('No type defined for name : ' + name + '|value : |' + value);
			await this.setObjectNotExistsAsync(state, {
				type: 'state',
				common: {
					name: name,
					read : true,
					write : false,
					role: 'state',
					type:'mixed'
				},
				native: {},
			});
			await this.setState(state, {val: value, ack: true, expire: intervall_time});
			
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