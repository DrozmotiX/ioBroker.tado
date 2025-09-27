const debounce = require('lodash.debounce');

class Tado extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'tado',
        });

        // Debounced API-Aufruf mit Rückgabewert
        this.debouncedSetZoneOverlay = debounce(
            (homeId, zoneId, config, resolve, reject) => {
                this._setZoneOverlay(homeId, zoneId, config)
                    .then(resolve)
                    .catch(reject);
            },
            750 // Verzögerung in Millisekunden
        );
    }

    /**
     * Führt den API-Aufruf für setZoneOverlay aus (debounced).
     *
     * @param {string} homeId
     * @param {string} zoneId
     * @param {object} config
     * @returns {Promise<any>} Rückgabewert des API-Aufrufs
     */
    async setZoneOverlayPool(homeId, zoneId, config) {
        return new Promise((resolve, reject) => {
            this.debouncedSetZoneOverlay(homeId, zoneId, config, resolve, reject);
        });
    }

    /**
     * Führt den eigentlichen API-Aufruf aus.
     *
     * @param {string} homeId
     * @param {string} zoneId
     * @param {object} config
     * @returns {Promise<any>} Rückgabewert des API-Aufrufs
     */
    async _setZoneOverlay(homeId, zoneId, config) {
        try {
            this.log.debug(`Calling API for setZoneOverlay with config: ${JSON.stringify(config)}`);
            const apiResponse = await this.api.apiCall(
                `/api/v2/homes/${homeId}/zones/${zoneId}/overlay`,
                'put',
                config,
                'setZoneOverlayPool'
            );
            this.log.debug(`API response for setZoneOverlay: ${JSON.stringify(apiResponse)}`);
            return apiResponse;
        } catch (error) {
            this.log.error(`Error in _setZoneOverlay: ${error}`);
            throw error;
        }
    }
}


try {
    const result = await tadoInstance.setZoneOverlayPool(homeId, zoneId, config);
    console.log('API-Aufruf erfolgreich:', result);
} catch (error) {
    console.error('Fehler beim API-Aufruf:', error);
}

