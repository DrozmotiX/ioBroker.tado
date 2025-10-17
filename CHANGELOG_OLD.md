# Older changes
## 0.7.7 (2025-04-08)
* (HGlab01) optimize sentry usage
* (HGlab01) improve retry-mechanism when it comes to erros

## 0.7.5 (2025-03-31)
* (HGlab01) some further refactorings
* (HGlab01) Bump axios to 1.8.4

## 0.7.3 (2025-03-17)
* (HGlab01) refactoring debug logs
* (HGlab01) Bump axios to 1.8.3

## 0.7.2 (2025-03-12)
* (HGlab01) improve sentry logs

## 0.7.1 (2025-03-09)
* (HGlab01) !!!BREAKING CHANGE!!! new Authentification method (https://github.com/DrozmotiX/ioBroker.tado/issues/954)
* (HGlab01) Bump axios to 1.8.2
* (HGlab01) Improve error messages for Sentry
* (HGlab01) Add attributes 'tariffLowPriceAlert' and 'tariffHighPriceAlert'

## 0.6.1 (2024-11-04)
* (HGlab01) Add attributes 'expiryInSeconds' and 'activated'
* (HGlab01) Extend timeout back to 20s
* (HGlab01) Tado° X improvements

## 0.6.0 (2024-10-23)
* (HGlab01) Start supporting Tado° X

## 0.5.9 (2024-10-16)
* (HGlab01) Improve axios promise handling

## 0.5.7 (2024-09-30)
* (HGlab01) Change of attribute "light" supported
* (HGlab01) Add attribute 'connection'
* (HGlab01) Add attribute 'supportsFlowTemperatureOptimization'
* (HGlab01) Bump axios to 1.7.7
* (HGlab01) EnergyIQ meter-readings can be uploaded

## 0.5.6 (2024-08-06)
* (HGlab01) Improve AccessToken Management
* (HGlab01) Bump axios to 1.7.3
* (HGlab01) Add attribute 'language'
* (HGlab01) Add attribute 'isHeatPumpInstalled'

## 0.5.5 (2024-06-25)
* (HGlab01) Bump axios to 1.7.2

## 0.5.4 (2024-04-18)
* (HGlab01) Add attribute 'runningOfflineSchedule'
* (HGlab01) Bump axios to 1.6.8

## 0.5.3 (2024-01-29)
* (HGlab01) Improve axios handling
* (HGlab01) Bump axios to 1.6.7

## 0.5.1 (2023-12-11)
* (HGlab01) Bump json-explorer to 0.1.15
* (HGlab01) Prepare (c) for 2024

## 0.5.0 (2023-11-25)
* (HGlab01) Breaking changes
    - Node.js 18.0 or higher
    - ioBroker host (js-controller) 5.0 or higher
* (HGlab01) fix jsonConf validation issue
* (HGlab01) Bump axios to 1.6.2
* (HGlab01) update contact data

## 0.4.12 (2023-11-14)
* (HGlab01) switch finaly to Admin5 UI
* (HGlab01) Improve REST-call handling
* (HGlab01) Bump axios to 1.6.1

## 0.4.11 (2023-10-09)
* (HGlab01) Bump json-explorer to 0.1.14
* (Garfonso) add value AUTO for *.Home.state.presence (in addtion to HOME and AWAY)
* (HGlab01) Bump axios to 1.5.1

## 0.4.10 (2023-09-26)
* (HGlab01) Add attribute 'isBalanceHpEligible'
* (HGlab01) improve axios keep_a_live

## 0.4.9 (2023-07-05)
* (HGlab01) Add attribute 'zonesCount'
* (HGlab01) Bump ioBroker-jsonExplorer to 0.1.12

## 0.4.8 (2023-05-12)
* (HGlab01) Add attribute 'isHeatSourceInstalled'
* (HGlab01) Bump axios to 1.4.0

## 0.4.7 (2023-04-26)
* (HGlab01) Add attribute 'generation'
* (HGlab01) improve axios error handling
* (HGlab01) Bump axios to 1.3.6

## 0.4.6 (2023-04-12)
* (HGlab01) Add attribute 'isEnergyIqEligible' (#613)
* (HGlab01) improve ETIMEDOUT issue
* (HGlab01) Bump ioBroker-jsonExplorer to 0.1.11
* (HGlab01) js-controller v5 readiness (#618)

## 0.4.5 (2023-03-08)
* (HGlab01) Add attribute 'sensorType' (#604)
* (HGlab01) Bump axios to 1.3.4

## 0.4.4 (2023-02-03)
* (HGlab01) Add attribute 'energyIqReminder' and 'specialOffersEnabled'
* (HGlab01) Bump axios to 1.3.1
* (HGlab01) Fix 'Invalid value TADO_MODE' (#585)

## 0.4.3 (2022-12-06)
* (HGlab01) Bump ioBroker-jsonExplorer to 0.1.10 (#551)
* (HGlab01) Bump axios to 1.2.1 (final fix for #561)
* (HGlab01) Improve logs

## 0.4.2 (2022-11-27)
* (HGlab01) Downgrade axios to 1.1.3 (#561)

## 0.4.1 (2022-11-24)
* (HGlab01) Add attribute isBalanceAcEligible
* (HGlab01) Bump axios from 0.27.2 to 1.2.0
* (HGlab01) Bump simple-oauth2 from 4.3.0 to 5.0.0

## 0.4.0 (2022-09-05)
* (HGlab01) !Breaking change! NodeJS 14.16 or higher required
* (HGlab01) !Breaking change! ioBroker js-controller 4.0 or higher required
* (HGlab01) Bump is-online from 9.0.1 to 10.0.0

## 0.3.16 (2022-08-01)
* (HGlab01) Support light (issue #519)
* (HGlab01) Add attributes vattenfallBannerDiscountCode, thresholdModeActive, mountingStateWithError, isAirComfortEligible

## 0.3.15 (2022-02-27)
* (DutchmanNL) move to jsonConfig.json (Admin 5)
* (ilueckel) Support steering of ActivateOpenWindow, OpenWindowDetection, childLockEnabled 
* (HGlab01) Bump iobroker-jsonexplorer to v0.1.9
* (HGlab01) js-controller 4.0 readiness

## 0.3.14 (2022-01-21)
* (HGlab01) Improve hotwater handling
* (HGlab01) Improve AC Control v3 devices 
* (HGlab01) Support swing ON/OFF for AC v3 devices

## 0.3.13 (2022-01-03)
* (HGlab01) Optimize internet-check by using isOnline-library
* (HGlab01) Support Smart AC Control V3+ (issue #403)
* (HGlab01) Offset temperature rounding to max. 2 digits

## 0.3.12 (2021-11-25)
* (HGlab01) support attribute 'showScheduleSetup'
* (HGlab01) fix HOT_WATER device issue with temperature
* (HGlab01) Bump iobroker-jsonexplorer to 0.1.8 (avoids re-sending same missing-attribeute info to Sentry after restart)

## 0.3.11 (2021-11-19)
* (HGlab01) support attributes 'showSwitchToAutoGeofencingButton', 'showHomePresenceSwitchButton', 'scheduleIsDefault' and 'additionalConsents'
* (HGlab01) enhance error messages if API-call fails
* (HGlab01) next time block fails (one reason for 422 error) if time blocks are not defined - fixed now
* (HGlab01) set HOME/AWAY is now suported by using state tado.x.yyyyyy.Home.state.presence
* (HGlab01) offset range -9.99/+10 validated
* (HGlab01) add masterswitch for power on/off (tado.[x].[yyyyyy].Home.masterswitch)
* (HGlab01) reduce logs in info-mode
* (HGlab01) AC temperature range fixed
* (HGlab01) Bump iobroker-jsonexplorer to 0.1.7

## 0.3.10 (2021-10-29)
* (HGlab01) API calls (except read) are queued and send one after the other
* (HGlab01) unhandled errors are now handled
* (HGlab01) Internet connection is checked before requests are placed
* (HGlab01) support attribute 'fanLevel' (Sentry: IOBROKER-TADO-35)
* (HGlab01) support structure element "folder", so now it is folder-->device-->channel
* (HGlab01) add home-states presence and presenceLock
* (HGlab01) Bump iobroker-jsonexplorer to 0.1.5

## 0.3.9 (2021-10-16)
* (DutchmanNL) force correct NodeJS dependency with error at install
* (HGlab01) implement queuing for API requests (avoids some status code 422 issues)

## 0.3.8 (2021-10-06)
* (HGlab01) support attributes 'orientfanLevelation', 'verticalSwing', 'horizontalSwing' (#352)
* (HGlab01) catch 422 issue in poolApiCall()

## 0.3.7 (2021-08-24)
* (HGlab01) ActiveTimeTable can be set (#337)
* (HGlab01) Improve logs and change code structure a little bit
* (HGlab01) manage min/max temperature for heating (5-25 celsius) and hotwater (30-80 celsius) to avoid API crashes (#341)

## 0.3.6 (2021-08-16)
* (HGlab01) support attribute 'orientation' (Sentry: IOBROKER-TADO-35)

## 0.3.5 (2021-08-05)
* (HGlab01) fix issue 'hot water cannot be switched on' (#309)
* (HGlab01) change to new sentry dsn
* (HGlab01) Bump iobroker-jsonexplorer to v0.1.2

## 0.3.4 (2021-07-24)
* (HGlab01) add attribute 'location' to blacklist (Sentry IOBROKER-TADO-2Y)
* (HGlab01) support attribute 'swing' (Sentry: IOBROKER-TADO-2G)
* (HGlab01) support attribute 'end' and 'commandTableUploadState' (Sentry: IOBROKER-TADO-1M)

## 0.3.3 (2021-07-19)
* (HGlab01) Add attributes title, ssid and code
* (HGlab01) Improve sentry handling by bumping iobroker-jsonexplorer to v0.1.1

## 0.3.2 (2021-07-15)
* (HGlab01) Use password handling from JS-Controller framework

## 0.3.1 (2021-07-15)
* (HGlab01) Works with Node 12.x or higher (simple-oauth2 update dependency)
* (HGlab01) Bump simple-oauth2 from 2.5.2 to 4.2.0
* (HGlab01) Prepare for first stable version

## 0.3.0 (2021-06-26)
* (HGlab01) Technical re-factoring of state management !BREAKING CHANGES! (see above)
* (HGlab01) implement offset functionality
* (HGlab01) Set minimum refresh time to 30 seconds
* (HGlab01) Bump iobroker-jsonexplorer to v0.1.0

## 0.2.7 (2021-05-11)
* (HGlab01) prepare for js-controller v3.3.x (has wrong type "xxxx" but has to be "yyyy") (#214)
* (HGlab01) improve state creation by using iobroker-jsonexplorer
* (HGlab01) improve CPU usage (#192)
* (HGlab01) add attribute enabledFeatures (#226)

## 0.2.6 (2021-03-20)
* (HGlab01) apply formatting for main.js
* (HGlab01) add quickActionsEnabled (#164)
* (HGlab01) support HOT_WATER devices (#138)
* (HGlab01) support AIR_CONDITIONING devices (#146)
* (HGlab01) Implement pool handling for setZoneOverlay
* (HGlab01) fix issue: state has no existing object (#184)
* (HGlab01) add cleaning function for existing timer 'polling'
* (HGlab01) state_attr.js: attribute 'support' was defined twice

## 0.2.5 (2020-12-16)
* (HGlab01) add childLockEnabled

## 0.2.4 (2020-11-19)
* (HGlab01) Improve overlay modes + solve merge issue of version 0.2.3

## 0.2.3 (2020-11-18)
* (HGlab01) add overlay methods 'timer'
* (HGlab01) deal with JSON object overlay or openWindow is null
* (HGlab01) Bugfix : Cannot read property 'percentage' of undefined

## 0.2.2 (2020-11-02)
* (HGlab01) add typeSkillBasedApp
* (HGlab01) add autoAssistFreeTrialEnabled
* (HGlab01) Add support for autoAssistFreeTrialEnabled
* (HGlab01) Overlay methods 'manual' and 'next time block'

## 0.2.1 (2020-10-22)
* (DutchmanNL) Update dependency's
* (DutchmanNL) Update testing, remove node 8 and add node 14
* (DutchmanNL) Implement automated deployment with githubActions
* (HGlab01) Support incident Detection
* (LutzHelling) Bugfix : Add orientation
* (LutzHelling) Bugfix : legacyHeatingInstallationsEnabled
* (HGlab01) Bugfix : Add legacyHeatingInstallationsEnabled to DoHome
* (HGlab01) Bugfix : Fix unhandled information found in DoReadDevices
