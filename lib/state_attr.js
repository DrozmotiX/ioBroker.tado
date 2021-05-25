// VE.Direct Protocol Version 3.26 from 27 November 2018
// Classification of all state attributes possible

const state_attrb = {
	'dateTimeZone': {
		name: 'Date time zone',
		type: 'string',
		role: 'state',
	},
	'phone': {
		name: 'Phone',
		type: 'string',
		role: 'state',
	},
	'capabilities': {
		name: 'Capabilities',
		type: 'string',
		role: 'state',
	},
	'deviceTypes': {
		name: 'Device types',
		role: 'state',
	},
	'projectedExpiry': {
		name: 'Projected expiry',
		type: 'string',
		role: 'value.time',
	},
	'start': {
		name: 'Start',
		type: 'string',
		role: 'state',
	},
	'preheatingLevel': {
		name: 'Preheating Level',
		type: 'string',
		role: 'state',
	},
	'addressLine1': {
		name: 'AddressLine 1',
		type: 'string',
		role: 'state',
	},
	'addressLine2': {
		name: 'AddressLine 2',
		type: 'string',
		role: 'state',
	},
	'zipCode': {
		name: 'ZIP code',
		type: 'string',
		role: 'state',
	},
	'city': {
		name: 'City',
		type: 'string',
		role: 'state',
	},
	'state': {
		name: 'State',
		type: 'string',
		role: 'state',
	},
	'country': {
		name: 'Country',
		type: 'string',
		role: 'state',
	},
	'longitude': {
		name: 'Longitude',
		type: 'number',
		role: 'state',
	},
	'consentGrantSkippable': {
		name: 'Consent gran skippable',
		type: 'boolean',
		role: 'state',
	},
	'percentage': {
		name: 'Percentage',
		type: 'number',
		role: 'state',
	},
	'timestamp': {
		name: 'Timestamp',
		type: 'string',
		role: 'value.time',
	},
	'fahrenheit': {
		name: 'Temperature Fahrenheit',
		type: 'number',
		role: 'value.temperature',
		unit: '°F'
	},
	'value': {
		name: 'Value',
		role: 'value',
	},
	'incidentDetection': {
		name: 'Incident detection',
		type: 'boolean',
		role: 'state',
	},
	'platform': {
		name: 'Platform',
		type: 'string',
		role: 'state',
	},
	'osVersion': {
		name: 'OS version',
		type: 'string',
		role: 'state',
	},
	'model': {
		name: 'Model',
		type: 'string',
		role: 'state',
	},
	'locale': {
		name: 'Locale',
		type: 'string',
		role: 'state',
	},
	'simpleSmartScheduleEnabled': {
		name: 'simple smart schedule enabled',
		type: 'boolean',
		role: 'state',
	},
	'awayRadiusInMeters': {
		name: 'Away radius in meters',
		type: 'number',
		role: 'state',
	},
	'skills': {
		name: 'Skills',
		type: 'string',
		role: 'state',
	},
	'christmasModeEnabled': {
		name: 'Christmas mode enabled',
		type: 'boolean',
		role: 'state',
	},
	'showAutoAssistReminders': {
		name: 'Show autoassist reminders',
		type: 'boolean',
		role: 'state',
	},
	'email': {
		name: 'email',
		type: 'string',
		role: 'state',
	},
	'name': {
		name: 'Name',
		type: 'string',
		role: 'state',
	},
	'awayModeReminder': {
		name: 'Away Mode  Reminder',
		type: 'boolean',
		role: 'state',
	},
	'atHome': {
		name: 'atHome',
		type: 'boolean',
		role: 'state',
	},
	'batteryState': {
		name: 'Battery State',
		role: 'indicator.lowbat',
	},
	'boilerId': {
		name: 'Boiler ID',
		type: 'number',
		role: 'value',
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
	},
	'currentFwVersion': {
		name: 'Current Fw Version',
		type: 'string',
		role: 'state',
	},
	'dazzleEnabled': {
		name: 'Dazzle  Enabled',
		type: 'boolean',
		role: 'state',
	},
	'dateCreated': {
		name: 'date Created',
		type: 'string',
		role: 'value.time',
	},
	'dazzleMode': {
		name: 'Dazzle  Mode',
		type: 'boolean',
		role: 'state',
	},
	'deviceType': {
		name: 'Device Type',
		role: 'info.name',
	},
	'duties': {
		name: 'Duties',
		role: 'state',
	},
	'energySavingsReportReminder': {
		name: 'Energy Savings Report  Reminder',
		type: 'boolean',
		role: 'state',
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
	},
	'geolocationOverride': {
		name: 'Geolocation Override',
		role: 'state',
	},
	'geolocationOverrideDisableTime': {
		name: 'Geolocation Override Disable Time',
		role: 'state',
	},
	'geoTrackingEnabled': {
		name: 'Geo Tracking Enabled',
		type: 'boolean',
		role: 'state',
	},
	'homeModeReminder': {
		name: 'Home Mode Reminder',
		type: 'boolean',
		role: 'state',
	},
	'installationCompleted': {
		name: 'Installation Completed',
		type: 'boolean',
		role: 'state',
	},
	'isDriverConfigured': {
		name: 'Driver Configured',
		role: 'button',
		type: 'boolean',
	},
	'latitude': {
		name: 'Latitude',
		type: 'number',
		role: 'value.gps.latitude',
	},
	'longtitude': {
		name: 'Longtitude',
		type: 'number',
		role: 'value.gps.longitude',
	},
	'link': {
		name: 'Link',
		role: 'value',
	},
	'lowBatteryReminder': {
		name: 'lowBatteryReminder',
		type: 'boolean',
		role: 'state',
	},
	'minimumAwayTemperature': {
		name: 'MinimumAway Temperature',
		type: 'number',
		role: 'value.temperature',
		unit: '°C'
	},
	'mountingState': {
		name: 'Sensor Data Points',
		type: 'string',
		role: 'state',
	},
	'nextScheduleChange': {
		name: 'Next Schedule Change',
		type: 'array',
		role: 'state',
	},
	'nextTimeBlock': {
		name: 'Next Time Block',
		type: 'array',
		role: 'state',
	},
	'onDemandLogRetrievalEnabled': {
		name: 'Log retrieval on  Demand Enabled',
		type: 'boolean',
		role: 'value',
	},
	'openWindowDetected': {
		name: 'Open window detected',
		type: 'boolean',
		role: 'sensor.window',
	},
	'openWindow': {
		name: 'Open Windows',
		type: 'boolean',
		role: 'sensor.window',
	},
	'openWindowReminder': {
		name: 'Open window reminder',
		type: 'boolean',
		role: 'state',
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
	},
	'overlayType': {
		name: 'Overlay Type',
		type: 'string',
		role: 'state',
	},
	'partner': {
		name: 'Dazzle  Mode',
		role: 'state',
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
		type: 'string',
		role: 'state',
	},
	'preventFromSubscribing': {
		name: 'preventFromSubscribing',
		type: 'boolean',
		role: 'state',
	},
	'reportAvailable': {
		name: 'Report Available',
		type: 'boolean',
		role: 'state',
	},
	'serialNo': {
		name: 'Serial Number',
		type: 'string',
		role: 'state',
	},
	'sensorDataPoints': {
		name: 'Sensor Data Points',
		role: 'state',
	},
	'shortSerialNo': {
		name: 'Serial Number short',
		type: 'string',
		role: 'state',
	},
	'supported': {
		name: 'Supported',
		type: 'boolean',
		role: 'state',
	},
	'supportsDazzle': {
		name: 'supports Dazzle',
		type: 'boolean',
		role: 'state',
	},
	'tadoMode': {
		name: 'Tado Mode',
		type: 'string',
		role: 'state',
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
		type: 'string',
		role: 'state',
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
	},
	'usePreSkillsApps': {
		name: 'Use pre skills Apps',
		type: 'boolean',
		role: 'info',
	},
	'enabled': {
		name: 'enabled',
		type: 'boolean',
		role: 'indicator.alarm',
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
	},
	'childLockEnabled': {
		name: 'Child-Lock enabled',
		type: 'boolean',
		role: 'state',
	},
	'Stage_01_GetMe_Data': {
		name: 'Stage 01 GetMeData',
		type: 'string',
		role: 'json',
	},
	'Stage_04_Weather': {
		name: 'Stage04 Weather',
		type: 'string',
		role: 'json',
	},
	'Stage_02_HomeData': {
		name: 'Stage 02 HomeData',
		type: 'string',
		role: 'json',
	},
	'Stage_14_StatesData': {
		name: 'Stage 14 StatesData',
		type: 'string',
		role: 'json',
	},
	'Stage_06_MobileDevicesData': {
		name: 'Stage 06 MobileDevicesData',
		type: 'string',
		role: 'json',
	},
	'Stage_08_ZonesData': {
		name: 'Stage 08 ZonesData',
		type: 'string',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_1': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_1': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_2': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_2': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_3': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_3': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_4': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_4': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_5': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_5': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_6': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_6': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_7': {
		name: 'Stage 09 ZoneStates data',
		type: 'string',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_7': {
		name: 'Stage 10 AwayConfiguration',
		type: 'string',
		role: 'json',
	},
	'online': {
		name: 'Online',
		type: 'boolean',
		role: 'indicator',
	},
	'expiry': {
		name: 'Online',
		type: 'string',
		role: 'value.time',
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
		unit: '°C',
		write: true
	},
	'enabledFeatures': {
		name: 'Enabled features',
		type: 'string',
		role: 'info',
	},
	'detectedTime': {
		name: 'Detected time',
		type: 'string',
		role: 'value.time',
	},
	'stale': {
		name: 'Stale',
		type: 'boolean',
		role: 'info',
	},
	'degrees': {
		name: 'Degrees',
		type: 'number',
		role: 'info',
	},
	'radians': {
		name: 'Radians',
		type: 'number',
		role: 'info',
	},
	'relativeDistanceFromHomeFence': {
		name: 'Relative distance from Home fence',
		type: 'number',
		role: 'info',
	},
};

module.exports = state_attrb;