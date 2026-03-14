/* in-browser cache implementation */

window.WfLocalCache = {

    Period: {
        Minute: 60,
        Hour: 3600,
        Day: 3600*24,
        Week: 3600*24*7
    },

    get: function(key, defValue, expireIn) {
        if (!key)
            return defValue

        const utils = window.WfUtils
        const self = window.WfLocalCache
        const now = new Date()
        const item = utils.storageRead(key)

        if (!item)
            return defValue

        const t = new Date(item.date)
        const deltaSec = (now - t) / 1000

        expireIn = expireIn || (self.Period.Day * 5)

        if (deltaSec > expireIn)
            return defValue

        return item.payload
    },

    set: function(key, payload) {
        if (!key)
            return

        const now = new Date()
        const utils = window.WfUtils

        if (payload === undefined)
            return utils.storageWrite(key)

        return utils.storageWrite(key, {
            date: now.toISOString(),
            payload: payload || {}
        })
    }
}