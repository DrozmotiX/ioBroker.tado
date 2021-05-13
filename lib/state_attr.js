// VE.Direct Protocol Version 3.26 from 27 November 2018
// Classification of all state attributes possible

const state_attrb = {
	'dateTimeZone': {
		name: 'Date time zone',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'phone': {
		name: 'Phone',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'capabilities': {
		name: 'Capabilities',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'deviceTypes': {
		name: 'Device types',
		role: 'state',
		unit: ''
	},
	'projectedExpiry': {
		name: 'Projected expiry',
		type: 'number',
		role: 'value.time',
		unit: ''
	},
	'start': {
		name: 'Start',
		type: 'number',
		role: 'state',
		unit: ''
	},
	'preheatingLevel': {
		name: 'Preheating Level',
		type: 'number',
		role: 'state',
		unit: ''
	},
	'addressLine1': {
		name: 'AddressLine 1',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'addressLine2': {
		name: 'AddressLine 2',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'zipCode': {
		name: 'ZIP code',
		type: 'number',
		role: 'state',
		unit: ''
	},
	'city': {
		name: 'City',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'state': {
		name: 'State',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'country': {
		name: 'Country',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'longitude': {
		name: 'Longitude',
		type: 'number',
		role: 'state',
		unit: ''
	},
	'consentGrantSkippable': {
		name: 'Consent gran skippable',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'percentage': {
		name: 'Percentage',
		type: 'number',
		role: 'state',
		unit: ''
	},
	'timestamp': {
		name: 'Timestamp',
		type: 'number',
		role: 'value.time',
		unit: ''
	},
	'fahrenheit': {
		name: 'Temperature Fahrenheit',
		type: 'number',
		role: 'value.temperature',
		unit: '°F'
	},
	'value': {
		name: 'Value',
		type: 'number',
		role: 'value',
		unit: ''
	},
	'incidentDetection': {
		name: 'Incident detection',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'platform': {
		name: 'Platform',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'osVersion': {
		name: 'OS version',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'model': {
		name: 'Model',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'locale': {
		name: 'Locale',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'simpleSmartScheduleEnabled': {
		name: 'simple smart schedule enabled',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'awayRadiusInMeters': {
		name: 'Away radius in meters',
		type: 'number',
		role: 'state',
		unit: ''
	},
	'skills': {
		name: 'Skills',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'christmasModeEnabled': {
		name: 'Christmas mode enabled',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'showAutoAssistReminders': {
		name: 'Show autoassist reminders',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'email': {
		name: 'email',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'name': {
		name: 'Name',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'awayModeReminder': {
		name: 'Away Mode  Reminder',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'atHome': {
		name: 'atHome',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'batteryState': {
		name: 'Battery State',
		role: 'indicator.lowbat ',
		unit: ''
	},
	'boilerId': {
		name: 'Boiler ID',
		type: 'number',
		role: 'value',
		unit: ''
	},
	'overlayClearZone': {
		name: 'Clear Zone Overlay',
		role: 'button',
		type: 'boolean',
		write: true
	},
	'connectionState': {
		name: 'Connection State',
		type: 'boolean',
		role: 'indicator.connected',
		unit: ''
	},
	'currentFwVersion': {
		name: 'Current Fw Version',
		type: 'number',
		role: 'state',
		unit: ''
	},
	'dazzleEnabled': {
		name: 'Dazzle  Enabled',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'dateCreated': {
		name: 'date Created',
		type: 'number',
		role: 'value.time',
		unit: ''
	},
	'dazzleMode': {
		name: 'Dazzle  Mode',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'deviceType': {
		name: 'Device Type',
		role: 'info.name',
		unit: ''
	},
	'duties': {
		name: 'Duties',
		role: 'state',
		unit: ''
	},
	'energySavingsReportReminder': {
		name: 'Energy Savings Report  Reminder',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'heatingPower': {
		name: 'Heating Power',
		type: 'number',
		role: 'value.valve',
		unit: '%'
	},
	'id': {
		name: 'id',
		role: 'state',
		unit: ''
	},
	'geolocationOverride': {
		name: 'Geolocation Override',
		role: 'state',
		unit: ''
	},
	'geolocationOverrideDisableTime': {
		name: 'Geolocation Override Disable Time',
		role: 'state',
		unit: ''
	},
	'geoTrackingEnabled': {
		name: 'Geo Tracking Enabled',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'homeModeReminder': {
		name: 'Home Mode Reminder',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'installationCompleted': {
		name: 'Installation Completed',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'isDriverConfigured': {
		name: 'Driver Configured',
		role: 'button',
		type: 'boolean',
		write: true,
		unit: ''
	},
	'latitude': {
		name: 'Latitude',
		type: 'number',
		role: 'value.gps.latitude',
		unit: ''
	},
	'longtitude': {
		name: 'Longtitude',
		type: 'number',
		role: 'value.gps.longitude',
		unit: ''
	},
	'link': {
		name: 'Link',
		role: 'value',
		unit: ''
	},
	'lowBatteryReminder': {
		name: 'lowBatteryReminder',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'minimumAwayTemperature': {
		name: 'MinimumAway Temperature',
		type: 'number',
		role: 'value.temperature',
		unit: '°C'
	},
	'mountingState': {
		name: 'Sensor Data Points',
		role: 'state',
		unit: ''
	},
	'nextScheduleChange': {
		name: 'Next Schedule Change',
		type: 'array',
		role: 'state',
		unit: ''
	},
	'nextTimeBlock': {
		name: 'Next Time Block',
		type: 'array',
		role: 'state',
		unit: ''
	},
	'onDemandLogRetrievalEnabled': {
		name: 'Log retrieval on  Demand Enabled',
		type: 'boolean',
		role: 'value',
		unit: ''
	},
	'openWindowDetected': {
		name: 'Open window detected',
		type: 'boolean',
		role: 'sensor.window',
		unit: ''
	},
	'openWindow': {
		name: 'Open Windows',
		type: 'boolean',
		role: 'sensor.window',
		unit: ''
	},
	'openWindowReminder': {
		name: 'Open window reminder',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'outsideTemperature': {
		name: 'Outside Temperature',
		type: 'number',
		role: 'value.temperature',
		unit: '°C'
	},
	'overlay': {
		name: 'Overlay',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'overlayType': {
		name: 'Overlay Type',
		type: 'string',
		role: 'state',
		unit: ''
	},
	'partner': {
		name: 'Dazzle  Mode',
		role: 'state',
		unit: ''
	},
	'power': {
		name: 'Power',
		type: 'string',
		role: 'switch.power',
		unit: '',
		write: true,
		states: {
			on: 'on',
			off: 'off'
		}
	},
	'preparation': {
		name: 'Preparation',
		role: 'state',
		unit: ''
	},
	'preventFromSubscribing': {
		name: 'preventFromSubscribing',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'reportAvailable': {
		name: 'Report Available',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'serialNo': {
		name: 'Serial Number',
		type: 'number',
		role: 'state',
		unit: ''
	},
	'sensorDataPoints': {
		name: 'Sensor Data Points',
		role: 'state',
		unit: ''
	},
	'shortSerialNo': {
		name: 'Serial Number short',
		role: 'state',
		unit: ''
	},
	'supported': {
		name: 'Supported',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'supportsDazzle': {
		name: 'supports Dazzle',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'tadoMode': {
		name: 'Tado Mode',
		role: 'state',
		unit: ''
	},
	'celsius': {
		name: 'Temperature Celsius',
		type: 'number',
		role: 'value.temperature',
		unit: '°C',
		write: true
	},
	'temperatureUnit': {
		name: 'temperature Unit',
		role: 'state',
		unit: ''
	},
	'timeoutInSeconds': {
		name: 'TimeoutInSeconds',
		type: 'number',
		role: 'state',
		unit: 's'
	},
	'type': {
		name: 'Type',
		role: 'state',
		unit: ''
	},
	'usePreSkillsApps': {
		name: 'Use pre skills Apps',
		type: 'boolean',
		role: 'info',
		unit: ''
	},
	'enabled': {
		name: 'enabled',
		type: 'boolean',
		role: 'indicator.alarm',
		unit: ''
	},
	'typeSkillBasedApp': {
		name: 'Type Skill Based App',
		role: 'state',
		write: true,
		unit: '',
		states: {
			'Manual': 'Permanent',
			'Next_Time_Block': 'Next Block',
			'Timer': 'Use Timer'
		}
	},
	'autoAssistFreeTrialEnabled': {
		name: 'Auto Assist Free Trial Enabled',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'durationInSeconds': {
		name: 'Duration In Seconds',
		role: 'value',
		type: 'number',
		write: true,
		unit: 's'
	},
	'fanSpeed': {
		name: 'Fan speed',
		role: 'state',
		type: 'string',
		write: true,
		unit: '',
		states: {
			'auto': 'Auto',
			'low': 'Low',
			'middle': 'Middle',
			'high': 'High'
		}
	},
	'mode': {
		name: 'AC mode',
		role: 'state',
		type: 'string',
		write: true,
		unit: '',
		states: {
			'auto': 'Auto',
			'heat': 'Heat',
			'cool': 'Cool',
			'dry': 'Dry',
			'fan': 'Fan'
		}
	},
	'quickActionsEnabled': {
		name: 'Qucik actions enabled',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'childLockEnabled': {
		name: 'Child-Lock enabled',
		type: 'boolean',
		role: 'state',
		unit: ''
	},
	'Stage_01_GetMe_Data': {
		name: 'Stage 01 GetMeData',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_04_Weather': {
		name: 'Stage04 Weather',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_02_HomeData': {
		name: 'Stage 02 HomeData',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_14_StatesData': {
		name: 'Stage 14 StatesData',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_06_MobileDevicesData': {
		name: 'Stage 06 MobileDevicesData',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_08_ZonesData': {
		name: 'Stage 08 ZonesData',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_09_ZoneStates_data_1': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_10_AwayConfiguration_1': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_09_ZoneStates_data_2': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_10_AwayConfiguration_2': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_09_ZoneStates_data_3': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_10_AwayConfiguration_3': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_09_ZoneStates_data_4': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_10_AwayConfiguration_4': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_09_ZoneStates_data_5': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_10_AwayConfiguration_5': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_09_ZoneStates_data_6': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_10_AwayConfiguration_6': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_09_ZoneStates_data_7': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'Stage_10_AwayConfiguration_7': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
		unit: ''
	},
	'online': {
		name: 'Online',
		type: 'boolean',
		role: 'indicator',
		unit: ''
	},
	'expiry': {
		name: 'Online',
		type: 'number',
		role: 'value.time',
		unit: ''
	},
	'remainingTimeInSeconds': {
		name: 'Online',
		type: 'number',
		role: 'value',
		unit: 's'
	},
	'temperature': {
		blacklist: true
	},
	'offsetFahrenheit': {
		name: 'Offset Fahrenheit',
		type: 'number',
		role: 'value.temperature',
		unit: '°F'
	},
	'offsetCelsius': {
		name: 'Offset Celcius',
		type: 'number',
		role: 'value.temperature',
		unit: '°C'
	},	
};

module.exports = state_attrb;
