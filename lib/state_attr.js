// VE.Direct Protocol Version 3.26 from 27 November 2018
// Classification of all state attributes possible
const state_attrb = {
	'dateTimeZone': {
		name: 'Date time zone',
	},
	'phone': {
		name: 'Phone',
	},
	'capabilities': {
		name: 'Capabilities',
	},
	'deviceTypes': {
		name: 'Device types',
	},
	'projectedExpiry': {
		name: 'Projected expiry',
		role: 'value.time',
	},
	'start': {
		name: 'Start',
		role: 'value.time',
	},
	'preheatingLevel': {
		name: 'Preheating Level',
	},
	'addressLine1': {
		name: 'AddressLine 1',
	},
	'addressLine2': {
		name: 'AddressLine 2',
	},
	'zipCode': {
		name: 'ZIP code',
	},
	'city': {
		name: 'City',
	},
	'state': {
		name: 'State',
	},
	'country': {
		name: 'Country',
	},
	'longitude': {
		name: 'Longitude',
	},
	'consentGrantSkippable': {
		name: 'Consent gran skippable',
	},
	'percentage': {
		name: 'Percentage',
	},
	'timestamp': {
		name: 'Timestamp',
		role: 'value.time',
	},
	'fahrenheit': {
		name: 'Temperature Fahrenheit',
		role: 'value.temperature',
		unit: '°F'
	},
	'value': {
		name: 'Value',
		role: 'value',
	},
	'incidentDetection': {
		name: 'Incident detection',
	},
	'platform': {
		name: 'Platform',
	},
	'osVersion': {
		name: 'OS version',
	},
	'model': {
		name: 'Model',
	},
	'locale': {
		name: 'Locale',
	},
	'simpleSmartScheduleEnabled': {
		name: 'simple smart schedule enabled',
	},
	'awayRadiusInMeters': {
		name: 'Away radius in meters',
	},
	'skills': {
		name: 'Skills',
	},
	'christmasModeEnabled': {
		name: 'Christmas mode enabled',
	},
	'showAutoAssistReminders': {
		name: 'Show autoassist reminders',
	},
	'email': {
		name: 'email',
	},
	'name': {
		name: 'Name',
	},
	'awayModeReminder': {
		name: 'Away Mode  Reminder',
	},
	'atHome': {
		name: 'atHome',
	},
	'batteryState': {
		name: 'Battery State',
		role: 'indicator.lowbat ',
	},
	'boilerId': {
		name: 'Boiler ID',
		role: 'value',
	},
	'clearZoneOverlay': {
		name: 'Clear Zone Overlay',
		role: 'button',
		write: true
	},
	'connectionState': {
		name: 'Connection State',
		role: 'indicator.connected',
	},
	'currentFwVersion': {
		name: 'Current Fw Version',
	},
	'dazzleEnabled': {
		name: 'Dazzle  Enabled',
	},
	'dateCreated': {
		name: 'date Created',
		role: 'value.time',
	},
	'dazzleMode': {
		name: 'Dazzle  Mode',
	},
	'deviceType': {
		name: 'Device Type',
		role: 'info.name',
	},
	'duties': {
		name: 'Duties',
	},
	'energySavingsReportReminder': {
		name: 'Energy Savings Report  Reminder',
	},
	'heatingPower': {
		name: 'Heating Power',
		role: 'value.valve',
		unit: '%'
	},
	'id': {
		name: 'id',
	},
	'geolocationOverride': {
		name: 'Geolocation Override',
	},
	'geolocationOverrideDisableTime': {
		name: 'Geolocation Override Disable Time',
	},
	'geoTrackingEnabled': {
		name: 'Geo Tracking Enabled',
	},
	'homeModeReminder': {
		name: 'Home Mode Reminder',
	},
	'installationCompleted': {
		name: 'Installation Completed',
	},
	'isDriverConfigured': {
		name: 'Driver Configured'
	},
	'latitude': {
		name: 'Latitude',
		role: 'value.gps.latitude',
	},
	'longtitude': {
		name: 'Longtitude',
		role: 'value.gps.longitude',
	},
	'link': {
		name: 'Link',
		role: 'value',
	},
	'lowBatteryReminder': {
		name: 'lowBatteryReminder',
	},
	'minimumAwayTemperature': {
		name: 'MinimumAway Temperature',
		role: 'value.temperature',
		unit: '°C'
	},
	'mountingState': {
		name: 'Sensor Data Points',
	},
	'nextScheduleChange': {
		name: 'Next Schedule Change',
	},
	'nextTimeBlock': {
		name: 'Next Time Block',
	},
	'onDemandLogRetrievalEnabled': {
		name: 'Log retrieval on  Demand Enabled',
		role: 'value',
	},
	'openWindowDetected': {
		name: 'Open window detected',
		role: 'sensor.window',
	},
	'openWindow': {
		name: 'Open Windows',
		role: 'sensor.window',
	},
	'openWindowReminder': {
		name: 'Open window reminder',
	},
	'outsideTemperature': {
		name: 'Outside Temperature',
		role: 'value.temperature',
		unit: '°C'
	},
	'overlay': {
		name: 'Overlay',
	},
	'overlayType': {
		name: 'Overlay Type',
	},
	'partner': {
		name: 'Dazzle  Mode',
	},
	'power': {
		name: 'Power',
		role: 'switch.power',
		write: true,
		states: {
			on: 'on',
			off: 'off'
		}
	},
	'preparation': {
		name: 'Preparation',
	},
	'preventFromSubscribing': {
		name: 'preventFromSubscribing',
	},
	'reportAvailable': {
		name: 'Report Available',
	},
	'serialNo': {
		name: 'Serial Number',
	},
	'sensorDataPoints': {
		name: 'Sensor Data Points',
	},
	'shortSerialNo': {
		name: 'Serial Number short',
	},
	'supported': {
		name: 'Supported',
	},
	'supportsDazzle': {
		name: 'supports Dazzle',
	},
	'tadoMode': {
		name: 'Tado Mode',
	},
	'celsius': {
		name: 'Temperature Celsius',
		role: 'value.temperature',
		unit: '°C',
		write: true
	},
	'temperatureUnit': {
		name: 'temperature Unit',
	},
	'timeoutInSeconds': {
		name: 'TimeoutInSeconds',
		unit: 's'
	},
	'type': {
		name: 'Type',
	},
	'usePreSkillsApps': {
		name: 'Use pre skills Apps',
		role: 'info',
	},
	'enabled': {
		name: 'enabled',
		role: 'indicator.alarm',
	},
	'typeSkillBasedApp': {
		name: 'Type Skill Based App',
		write: true,
		states: {
			'Manual': 'Permanent',
			'Next_Time_Block': 'Next Block',
			'Timer': 'Use Timer'
		}
	},
	'autoAssistFreeTrialEnabled': {
		name: 'Auto Assist Free Trial Enabled',
	},
	'durationInSeconds': {
		name: 'Duration In Seconds',
		role: 'value',
		write: true,
		unit: 's'
	},
	'fanSpeed': {
		name: 'Fan speed',
		write: true,
		states: {
			'auto': 'Auto',
			'low': 'Low',
			'middle': 'Middle',
			'high': 'High'
		}
	},
	'mode': {
		name: 'AC mode',
		write: true,
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
	},
	'childLockEnabled': {
		name: 'Child-Lock enabled',
	},
	'Stage_01_GetMe_Data': {
		name: 'Stage 01 GetMeData',
		role: 'json',
	},
	'Stage_04_Weather': {
		name: 'Stage04 Weather',
		role: 'json',
	},
	'Stage_02_HomeData': {
		name: 'Stage 02 HomeData',
		role: 'json',
	},
	'Stage_14_StatesData': {
		name: 'Stage 14 StatesData',
		role: 'json',
	},
	'Stage_06_MobileDevicesData': {
		name: 'Stage 06 MobileDevicesData',
		role: 'json',
	},
	'Stage_08_ZonesData': {
		name: 'Stage 08 ZonesData',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_1': {
		name: 'Stage 09 ZoneStates data',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_1': {
		name: 'Stage 10 AwayConfiguration',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_2': {
		name: 'Stage 09 ZoneStates data',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_2': {
		name: 'Stage 10 AwayConfiguration',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_3': {
		name: 'Stage 09 ZoneStates data',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_3': {
		name: 'Stage 10 AwayConfiguration',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_4': {
		name: 'Stage 09 ZoneStates data',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_4': {
		name: 'Stage 10 AwayConfiguration',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_5': {
		name: 'Stage 09 ZoneStates data',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_5': {
		name: 'Stage 10 AwayConfiguration',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_6': {
		name: 'Stage 09 ZoneStates data',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_6': {
		name: 'Stage 10 AwayConfiguration',
		role: 'json',
	},
	'Stage_09_ZoneStates_data_7': {
		name: 'Stage 09 ZoneStates data',
		role: 'json',
	},
	'Stage_10_AwayConfiguration_7': {
		name: 'Stage 10 AwayConfiguration',
		role: 'json',
	},
	'online': {
		name: 'Online',
		role: 'indicator',
	},
	'expiry': {
		name: 'Online',
		role: 'value.time',
	},
	'remainingTimeInSeconds': {
		name: 'Online',
		role: 'value',
		unit: 's'
	},
	'solarIntensity': {
		role: 'info'
	},
	'geolocation': {
		role: 'info'
	},
	'Actual_Humidity': {
		role: 'info'
	},
	'Actual_Temperature': {
		role: 'info'
	},
	'weatherState': {
		role: 'info'
	},
	'temperature': {
		name: 'Temperature Celsius',
		role: 'value.temperature',
		unit: '°C',
		write: true
	},
};
module.exports = state_attrb;
