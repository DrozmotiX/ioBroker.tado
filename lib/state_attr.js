// Classification of all state attributes possible

const state_attrb = {
    'activated': {
        'name': 'Activated',
        'role': 'info',
        'type': 'boolean'
    },
    'additionalConsents': {
        'name': 'Additional Consents',
        'role': 'json',
        'type': 'string'
    },
    'addressLine1': {
        'name': 'AddressLine 1',
        'role': 'state',
        'type': 'string'
    },
    'addressLine2': {
        'name': 'AddressLine 2',
        'role': 'state',
        'type': 'string'
    },
    'allOff': {
        'name': 'All off',
        'role': 'button',
        'type': 'boolean',
        'write': true
    },
    'atHome': {
        'name': 'atHome',
        'role': 'state',
        'type': 'boolean'
    },
    'autoAssistFreeTrialEnabled': {
        'name': 'Auto Assist Free Trial Enabled',
        'role': 'state',
        'type': 'boolean'
    },
    'awayModeReminder': {
        'name': 'Away Mode Reminder',
        'role': 'state',
        'type': 'boolean'
    },
    'awayRadiusInMeters': {
        'name': 'Away radius in meters',
        'role': 'state',
        'type': 'number'
    },
    'batteryState': {
        'name': 'Battery State',
        'role': 'indicator.lowbat'
    },
    'boilerId': {
        'name': 'Boiler ID',
        'role': 'value',
        'type': 'number'
    },
    'boost': {
        'name': 'Boost',
        'role': 'button',
        'type': 'boolean',
        'write': true
    },
    'canSetTemperature': {
        'name': 'Can set temperature',
        'role': 'info',
        'type': 'boolean'
    },
    'capabilities': {
        'name': 'Capabilities',
        'role': 'state',
        'type': 'string'
    },
    'celsius': {
        'name': 'Temperature Celsius',
        'role': 'value.temperature',
        'type': 'number',
        'unit': '°C',
        'write': true
    },
    'childLockEnabled': {
        'name': 'Child-Lock enabled',
        'role': 'state',
        'type': 'boolean',
        'write': true
    },
    'christmasModeEnabled': {
        'name': 'Christmas mode enabled',
        'role': 'state',
        'type': 'boolean'
    },
    'city': {
        'name': 'City',
        'role': 'state',
        'type': 'string'
    },
    'code': {
        'name': 'Code',
        'role': 'info',
        'type': 'string'
    },
    'commandTableUploadState': {
        'name': 'Command table upload state',
        'role': 'info',
        'type': 'string'
    },
    'connection': {
        'name': 'Connection',
        'role': 'indicator.connected',
        'type': 'boolean'
    },
    'connectionState': {
        'name': 'Connection State',
        'role': 'indicator.connected',
        'type': 'boolean'
    },
    'consentGrantSkippable': {
        'name': 'Consent gran skippable',
        'role': 'state',
        'type': 'boolean'
    },
    'country': {
        'name': 'Country',
        'role': 'state',
        'type': 'string'
    },
    'currentFwVersion': {
        'name': 'Current Fw Version',
        'role': 'state',
        'type': 'string'
    },
    'dateCreated': {
        'name': 'date Created',
        'role': 'value.time',
        'type': 'string'
    },
    'dateTimeZone': {
        'name': 'Date time zone',
        'role': 'state',
        'type': 'string'
    },
    'dazzleEnabled': {
        'name': 'Dazzle Enabled',
        'role': 'state',
        'type': 'boolean'
    },
    'activateOpenWindow': {
        'name': 'Activate Open Window',
        'role': 'button',
        'type': 'boolean',
        'write': true
    },
    'controlType': {
        'name': 'Control Type',
        'role': 'state',
        'type': 'string',
        'write': true,
        'states': {
            'TIMER': 'Use Timer',
            'MANUAL': 'Manual',
            'NEXT_TIME_BLOCK': 'Next time block'
        }
    },
    'dazzleMode': {
        'name': 'Dazzle Mode',
        'role': 'state',
        'type': 'boolean'
    },
    'degrees': {
        'name': 'Degrees',
        'role': 'info',
        'type': 'number'
    },
    'detectedTime': {
        'name': 'Detected time',
        'role': 'value.time',
        'type': 'string'
    },
    'deviceType': {
        'name': 'Device Type',
        'role': 'info.name'
    },
    'deviceTypes': {
        'name': 'Device types',
        'role': 'state'
    },
    'durationInSeconds': {
        'name': 'Duration In Seconds',
        'role': 'value',
        'type': 'number',
        'unit': 's',
        'write': true
    },
    'duties': {
        'name': 'Duties',
        'role': 'state'
    },
    'email': {
        'name': 'email',
        'role': 'state',
        'type': 'string'
    },
    'enabled': {
        'name': 'enabled',
        'role': 'indicator.alarm',
        'type': 'boolean'
    },
    'enabledFeatures': {
        'name': 'Enabled features',
        'role': 'info',
        'type': 'string'
    },
    'end': {
        'name': 'End',
        'role': 'value.time',
        'type': 'string'
    },
    'energyIqReminder': {
        'name': 'Energy IQ Reminder',
        'role': 'info',
        'type': 'boolean'
    },
    'energySavingsReportReminder': {
        'name': 'Energy Savings Report Reminder',
        'role': 'state',
        'type': 'boolean'
    },
    'expiry': {
        'name': 'Online',
        'role': 'value.time',
        'type': 'string'
    },
    'expiryInSeconds': {
        'name': 'Expiry in seconds',
        'role': 'info',
        'type': 'number'
    },
    'fahrenheit': {
        'name': 'Temperature Fahrenheit',
        'role': 'value.temperature',
        'type': 'number',
        'unit': '°F',
        'write': true
    },
    'fanLevel': {
        'name': 'Fan Level',
        'role': 'info',
        'type': 'string',
        'write': true,
        'states': {
            'silent': 'Silent',
            'level1': 'Level1',
            'level2': 'Level2',
            'level3': 'Level3',
            'level4': 'Level4',
            'level5': 'Level5',
            'auto': 'Auto'
        },
    },
    'fanSpeed': {
        'name': 'Fan speed',
        'role': 'state',
        'states': {
            'auto': 'Auto',
            'high': 'High',
            'low': 'Low',
            'middle': 'Middle'
        },
        'type': 'string',
        'unit': '',
        'write': true
    },
    'fanSpeeds': {
        'name': 'Fan speeds',
        'role': 'info',
        'type': 'string'
    },
    'firmwareVersion': {
        'name': 'Firmware version',
        'role': 'info',
        'type': 'string'
    },
    'generation': {
        'name': 'Generation',
        'role': 'info'
    },
    'geolocationOverride': {
        'name': 'Geolocation Override',
        'role': 'state'
    },
    'geolocationOverrideDisableTime': {
        'name': 'Geolocation Override Disable Time',
        'role': 'state'
    },
    'geoTrackingEnabled': {
        'name': 'Geo Tracking Enabled',
        'role': 'state',
        'type': 'boolean'
    },
    'heatingPower': {
        'name': 'Heating Power',
        'role': 'value.valve',
        'type': 'number',
        'unit': '%'
    },
    'homeModeReminder': {
        'name': 'Home Mode Reminder',
        'role': 'state',
        'type': 'boolean'
    },
    'horizontalSwing': {
        'name': 'Horizontal Swing',
        'role': 'info',
        'type': 'string',
        'write': true,
        'states': {
            'on': 'On',
            'off': 'Off',
            'MidLeft': 'MID_LEFT',
            'MidRight': 'MID_RIGHT',
        },
    },
    'id': {
        'name': 'id',
        'role': 'state'
    },
    'incidentDetection': {
        'name': 'Incident detection',
        'role': 'state',
        'type': 'boolean'
    },
    'installationCompleted': {
        'name': 'Installation Completed',
        'role': 'state',
        'type': 'boolean'
    },
    'isAirComfortEligible': {
        'name': 'is AirComfort eligible',
        'role': 'info',
        'type': 'boolean'
    },
    'isBalanceAcEligible': {
        'name': 'Balance AC eligible',
        'role': 'info',
        'type': 'boolean'
    },
    'isBalanceHpEligible': {
        'name': 'Balance HP eligible',
        'role': 'info',
        'type': 'boolean'
    },
    'isDriverConfigured': {
        'name': 'Driver Configured',
        'role': 'button',
        'type': 'boolean'
    },
    'isEnergyIqEligible': {
        'name': 'EnergyIq eligible',
        'role': 'info',
        'type': 'boolean'
    },
    'isHeatPumpInstalled': {
        'name': 'is heatpump installed',
        'role': 'info',
        'type': 'boolean'
    },
    'isHeatSourceInstalled': {
        'name': 'is Heat Source installed',
        'role': 'info',
        'type': 'boolean'
    },
    'language': {
        'name': 'Language',
        'role': 'info',
        'type': 'string'
    },
    'latitude': {
        'name': 'Latitude',
        'role': 'value.gps.latitude',
        'type': 'number'
    },
    'light': {
        'name': 'Light',
        'role': 'info',
        'states': {
            'ON': 'ON',
            'OFF': 'OFF'
        },
        'type': 'string',
        'write': true
    },
    'link': {
        'name': 'Link',
        'role': 'value'
    },
    'locale': {
        'name': 'Locale',
        'role': 'state',
        'type': 'string'
    },
    'location': {
        'blacklist': true
    },
    'longitude': {
        'name': 'Longitude',
        'role': 'value.gps.longitude',
        'type': 'number'
    },
    'longtitude': {
        'name': 'Longtitude',
        'role': 'value.gps.longitude',
        'type': 'number'
    },
    'lowBatteryReminder': {
        'name': 'lowBatteryReminder',
        'role': 'state',
        'type': 'boolean'
    },
    'masterswitch': {
        'name': 'Masterswitch',
        'role': 'state',
        'states': {
            'ON': 'ON',
            'OFF': 'OFF'
        },
        'type': 'string',
        'write': true
    },
    'max': {
        'name': 'max. Temperature',
        'role': 'value.temperature',
        'type': 'number',
        'unit': '°C'
    },
    'meterReadings': {
        'name': 'Meter readings',
        'role': 'json',
        'type': 'string',
        'write': true
    },
    'min': {
        'name': 'min. Temperature',
        'role': 'value.temperature',
        'type': 'number',
        'unit': '°C'
    },
    'minimumAwayTemperature': {
        'name': 'MinimumAway Temperature',
        'role': 'value.temperature',
        'type': 'number',
        'unit': '°C'
    },
    'mode': {
        'name': 'AC mode',
        'role': 'state',
        'states': {
            'auto': 'Auto',
            'cool': 'Cool',
            'dry': 'Dry',
            'fan': 'Fan',
            'heat': 'Heat'
        },
        'type': 'string',
        'unit': '',
        'write': true
    },
    'model': {
        'name': 'Model',
        'role': 'state',
        'type': 'string'
    },
    'mountingState': {
        'name': 'Mounting state',
        'role': 'state',
        'type': 'string'
    },
    'mountingStateWithError': {
        'name': 'Mounting state with error',
        'role': 'state',
        'type': 'string'
    },
    'name': {
        'name': 'Name',
        'role': 'state',
        'type': 'string'
    },
    'nextScheduleChange': {
        'name': 'Next Schedule Change',
        'role': 'state',
        'type': 'array'
    },
    'nextTimeBlock': {
        'name': 'Next Time Block',
        'role': 'state',
        'type': 'array'
    },
    'offsetCelsius': {
        'name': 'Offset Celcius',
        'role': 'value.temperature',
        'type': 'number',
        'unit': '°C',
        'write': true
    },
    'offsetFahrenheit': {
        'name': 'Offset Fahrenheit',
        'role': 'value.temperature',
        'type': 'number',
        'unit': '°F'
    },
    'onDemandLogRetrievalEnabled': {
        'name': 'Log retrieval on Demand Enabled',
        'role': 'value',
        'type': 'boolean'
    },
    'online': {
        'name': 'Online',
        'role': 'indicator',
        'type': 'boolean'
    },
    'openWindow': {
        'name': 'Open Windows',
        'role': 'sensor.window',
        'type': 'boolean'
    },
    'openWindowDetected': {
        'name': 'Open window detected',
        'role': 'sensor.window',
        'type': 'boolean'
    },
    'openWindowReminder': {
        'name': 'Open window reminder',
        'role': 'state',
        'type': 'boolean'
    },
    'orientation': {
        'name': 'Orientation',
        'role': 'info',
        'type': 'string'
    },
    'orientfanLevelation': {
        'name': 'Orient Fan Levelation',
        'role': 'info',
        'type': 'string'
    },
    'osVersion': {
        'name': 'OS version',
        'role': 'state',
        'type': 'string'
    },
    'outsideTemperature': {
        'name': 'Outside Temperature',
        'role': 'value.temperature',
        'type': 'number',
        'unit': '°C'
    },
    'overlay': {
        'name': 'Overlay',
        'role': 'state',
        'type': 'string'
    },
    'overlayClearZone': {
        'name': 'Clear Zone Overlay',
        'role': 'button',
        'type': 'boolean',
        'write': true
    },
    'overlayType': {
        'name': 'Overlay Type',
        'role': 'state',
        'type': 'string'
    },
    'partner': {
        'name': 'Partner',
        'role': 'state'
    },
    'percentage': {
        'name': 'Percentage',
        'role': 'state',
        'type': 'number',
        'unit': '%'
    },
    'phone': {
        'name': 'Phone',
        'role': 'state',
        'type': 'string'
    },
    'platform': {
        'name': 'Platform',
        'role': 'state',
        'type': 'string'
    },
    'power': {
        'name': 'Power',
        'role': 'switch.power',
        'states': {
            'OFF': 'Off',
            'ON': 'On'
        },
        'type': 'string',
        'unit': '',
        'write': true
    },
    'preheatingLevel': {
        'name': 'Preheating Level',
        'role': 'state',
        'type': 'string'
    },
    'preparation': {
        'name': 'Preparation',
        'role': 'state',
        'type': 'string'
    },
    'presence': {
        'name': 'Presence',
        'role': 'info',
        'type': 'string',
        'write': true,
        'states': {
            'AWAY': 'Away',
            'HOME': 'Home',
            'AUTO': 'Auto'
        }
    },
    'presenceLocked': {
        'name': 'Presence Locked',
        'role': 'info',
        'type': 'boolean'
    },
    'preventFromSubscribing': {
        'name': 'preventFromSubscribing',
        'role': 'state',
        'type': 'boolean'
    },
    'projectedExpiry': {
        'name': 'Projected expiry',
        'role': 'value.time',
        'type': 'string'
    },
    'quickActionsEnabled': {
        'name': 'Qucik actions enabled',
        'role': 'state',
        'type': 'boolean'
    },
    'radians': {
        'name': 'Radians',
        'role': 'info',
        'type': 'number'
    },
    'relativeDistanceFromHomeFence': {
        'name': 'Relative distance from Home fence',
        'role': 'info',
        'type': 'number'
    },
    'remainingTimeInSeconds': {
        'name': 'Online',
        'role': 'value',
        'type': 'number',
        'unit': 's',
        write: true
    },
    'reportAvailable': {
        'name': 'Report Available',
        'role': 'state',
        'type': 'boolean'
    },
    'resumeScheduleHome': {
        'name': 'Resume Schedule Home',
        'role': 'button',
        'type': 'boolean',
        'write': true
    },
    'resumeScheduleRoom': {
        'name': 'Resume Schedule Room',
        'role': 'button',
        'type': 'boolean',
        'write': true
    },
    'runningOfflineSchedule': {
        'name': 'Running offline schedule',
        'role': 'info',
        'type': 'boolean'
    },
    'scheduleIsDefault': {
        'name': 'Schedule is default',
        'role': 'info',
        'type': 'boolean'
    },
    'sensorDataPoints': {
        'name': 'Sensor Data Points',
        'role': 'state'
    },
    'sensorType': {
        'name': 'sensor Type',
        'role': 'info',
        'type': 'string'
    },
    'serialNo': {
        'name': 'Serial Number',
        'role': 'state',
        'type': 'string'
    },
    'serialNumber': {
        'name': 'Firmware version',
        'role': 'info',
        'type': 'string'
    },
    'shortSerialNo': {
        'name': 'Serial Number short',
        'role': 'state',
        'type': 'string'
    },
    'showAutoAssistReminders': {
        'name': 'Show autoassist reminders',
        'role': 'state',
        'type': 'boolean'
    },
    'showHomePresenceSwitchButton': {
        'name': 'Show Home Presence Switch Button',
        'role': 'info',
        'type': 'boolean'
    },
    'showScheduleSetup': {
        'name': 'Show Schedule Setup',
        'role': 'info',
        'type': 'boolean'
    },
    'showSwitchToAutoGeofencingButton': {
        'name': 'Show Switch To AutoGeofencing Button',
        'role': 'info',
        'type': 'boolean'
    },
    'simpleSmartScheduleEnabled': {
        'name': 'simple smart schedule enabled',
        'role': 'state',
        'type': 'boolean'
    },
    'skills': {
        'name': 'Skills',
        'role': 'state',
        'type': 'string'
    },
    'specialOffersEnabled': {
        'name': 'special Offers enabled',
        'role': 'info',
        'type': 'boolean'
    },
    'ssid': {
        'name': 'SSID',
        'role': 'info',
        'type': 'string'
    },
    'Stage_01_GetMe_Data': {
        'name': 'Stage 01 GetMeData',
        'role': 'json',
        'type': 'string'
    },
    'Stage_02_HomeData': {
        'name': 'Stage 02 HomeData',
        'role': 'json',
        'type': 'string'
    },
    'Stage_04_Weather': {
        'name': 'Stage04 Weather',
        'role': 'json',
        'type': 'string'
    },
    'Stage_06_MobileDevicesData': {
        'name': 'Stage 06 MobileDevicesData',
        'role': 'json',
        'type': 'string'
    },
    'Stage_08_ZonesData': {
        'name': 'Stage 08 ZonesData',
        'role': 'json',
        'type': 'string'
    },
    'Stage_09_ZoneStates_data_1': {
        'name': 'Stage 09 ZoneStates data',
        'role': 'json',
        'type': 'string'
    },
    'Stage_09_ZoneStates_data_2': {
        'name': 'Stage 09 ZoneStates data',
        'role': 'json',
        'type': 'string'
    },
    'Stage_09_ZoneStates_data_3': {
        'name': 'Stage 09 ZoneStates data',
        'role': 'json',
        'type': 'string'
    },
    'Stage_09_ZoneStates_data_4': {
        'name': 'Stage 09 ZoneStates data',
        'role': 'json',
        'type': 'string'
    },
    'Stage_10_AwayConfiguration_1': {
        'name': 'Stage 10 AwayConfiguration',
        'role': 'json',
        'type': 'string'
    },
    'Stage_10_AwayConfiguration_2': {
        'name': 'Stage 10 AwayConfiguration',
        'role': 'json',
        'type': 'string'
    },
    'Stage_10_AwayConfiguration_3': {
        'name': 'Stage 10 AwayConfiguration',
        'role': 'json',
        'type': 'string'
    },
    'Stage_10_AwayConfiguration_4': {
        'name': 'Stage 10 AwayConfiguration',
        'role': 'json',
        'type': 'string'
    },
    'Stage_11_HomeState': {
        'name': 'Stage 10 AwayConfiguration',
        'role': 'json',
        'type': 'string'
    },
    'Stage_13_TimeTables_1': {
        'name': 'Stage 13 Time Tables',
        'role': 'json',
        'type': 'string'
    },
    'Stage_13_TimeTables_2': {
        'name': 'Stage 13 Time Tables',
        'role': 'json',
        'type': 'string'
    },
    'Stage_13_TimeTables_3': {
        'name': 'Stage 13 Time Tables',
        'role': 'json',
        'type': 'string'
    },
    'Stage_13_TimeTables_4': {
        'name': 'Stage 13 Time Tables',
        'role': 'json',
        'type': 'string'
    },
    'stale': {
        'name': 'Stale',
        'role': 'info',
        'type': 'boolean'
    },
    'start': {
        'name': 'Start',
        'role': 'state',
        'type': 'string'
    },
    'state': {
        'name': 'State',
        'role': 'state',
        'type': 'string'
    },
    'step': {
        'name': 'Temperature step',
        'role': 'info',
        'type': 'number',
        'unit': '°C'
    },
    'supported': {
        'name': 'Supported',
        'role': 'state',
        'type': 'boolean'
    },
    'supportsDazzle': {
        'name': 'supports Dazzle',
        'role': 'state',
        'type': 'boolean'
    },
    'supportsFlowTemperatureOptimization': {
        'name': 'supports flow temperature optimization',
        'role': 'info',
        'type': 'boolean'
    },
    'swing': {
        'name': 'Swing',
        'role': 'info',
        'type': 'string',
        'write': true,
        'states': {
            'on': 'ON',
            'off': 'OFF'
        },
    },
    'swings': {
        'name': 'Swings',
        'role': 'info',
        'type': 'string'
    },
    'tadoMode': {
        'name': 'Tado Mode',
        'role': 'state',
        'type': 'string'
    },
    'temperature': {
        'blacklist': true
    },
    'temperatureAsMeasured': {
        'name': 'Temperature as measured',
        'role': 'info',
        'type': 'number'
    },
    'temperatureOffset': {
        'name': 'Temperature Offset',
        'role': 'info',
        'type': 'number'
    },
    'temperatureUnit': {
        'name': 'temperature Unit',
        'role': 'state',
        'type': 'string'
    },
    'timeoutInSeconds': {
        'name': 'TimeoutInSeconds',
        'role': 'state',
        'type': 'number',
        'unit': 's',
        'write': true
    },
    'openWindowDetectionEnabled': {
        'name': 'Open window detection enabled',
        'role': 'state',
        'type': 'boolean',
        'write': true
    },
    'timestamp': {
        'name': 'Timestamp',
        'role': 'value.time',
        'type': 'string'
    },
    'title': {
        'name': 'Title',
        'role': 'info',
        'type': 'string'
    },
    'thresholdModeActive': {
        'name': 'Threshold Mode Active',
        'role': 'info',
        'type': 'boolean'
    },
    'tt_id': {
        'name': 'TimeTable ID',
        'role': 'info',
        'states': {
            '0': 'Mo-Su',
            '1': 'Mo-Fr,Sa,Su',
            '2': 'Every day'
        },
        'type': 'number',
        'write': true
    },
    'type': {
        'name': 'Type',
        'role': 'state',
    },
    'typeSkillBasedApp': {
        'name': 'Type Skill Based App',
        'role': 'state',
        'states': {
            'Manual': 'Permanent',
            'NEXT_TIME_BLOCK': 'Next Block',
            'TIMER': 'Use Timer'
        },
        'unit': '',
        'write': true
    },
    'usePreSkillsApps': {
        'name': 'Use pre skills Apps',
        'role': 'info',
        'type': 'boolean'
    },
    'value': {
        'name': 'Value',
        'role': 'value',
        write: true
    },
    'vattenfallBannerDiscountCode': {
        'name': 'VattenfallBannerDiscountCode',
        'role': 'info',
        'type': 'string'
    },
    'verticalSwing': {
        'name': 'Vertical Swing',
        'role': 'info',
        'type': 'string',
        'write': true,
        'states': {
            'on': 'On',
            'off': 'Off'
        },
    },
    'zipCode': {
        'name': 'ZIP code',
        'role': 'state',
        'type': 'string'
    },
    'zonesCount': {
        'name': 'Zones count',
        'role': 'info',
        'type': 'number'
    }
};

module.exports = state_attrb;
