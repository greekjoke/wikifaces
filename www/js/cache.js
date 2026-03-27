/* in-browser cache implementation */

window.WfLocalCache = {

    Period: {
        Minute: 60,
        Hour: 3600,
        Day: 3600*24,
        Week: 3600*24*7,
        Infinite: Number.MAX_VALUE
    },

    _isExpired(item) {
        const now = new Date()
        const t = new Date(item.date)
        const deltaSec = (now - t) / 1000
        const expireIn = item.expire || (self.Period.Day * 5)
        return deltaSec > expireIn
    },

    get: function(key, defValue) {
        if (!key)
            return defValue

        const utils = window.WfUtils
        const item = utils.storageRead(key)

        if (!item || this._isExpired(item))
            return defValue

        return item.payload
    },

    set: function(key, payload, expireIn) {
        if (!key)
            return

        const now = new Date()
        const utils = window.WfUtils

        if (payload === undefined)
            return utils.storageWrite(key)

        expireIn = expireIn || (self.Period.Day * 5)

        return utils.storageWrite(key, {
            date: now.toISOString(),
            expire: expireIn,
            payload: payload || {}
        })
    },

    cleanup: function() {
        const that = this
        const utils = window.WfUtils
        let counter = 0

        console.log('cache cleanup...')

        Object.keys(localStorage).forEach(key => {
            const item = utils.storageRead(key)
            if (typeof item === 'object' &&
                ('expire' in item) && ('date' in item))
            {
                if (that._isExpired(item)) {
                    console.log(`found expired item: ${key}`)
                    utils.storageWrite(key) // remove
                }
            }
            counter++
        });

        console.log(`checked ${counter} cache items`)
    }
}

// remove expired data
window.WfLocalCache.cleanup()
