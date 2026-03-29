/* routines */

window.WfUtils = {

    getRandomInt: function(min, max) {
        const range = max - min
        return Math.floor(Math.random() * range) + Math.floor(min)
    },

    genUid: function() {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        )
    },

    isNumeric: function(str) {
        if (typeof str != "string" || str.length === 0)
            return false;
        return !isNaN(str) && isFinite(str);
    },

    isMobile: function() {
        return (/Android|iPhone/i.test(navigator.userAgent))
    },

    isLocalhost: function() {
        return document.location.href.indexOf('/localhost') !== -1
    },

    hasQueryKey: function(key) {
        return document.location.href.indexOf('?' + key + '=') != -1 ||
            document.location.href.indexOf('&' + key + '=') != -1
    },

    clamp: function(v, min, max) {
        return Math.max(min, Math.min(v, max))
    },

    clone: function(obj) {
        return JSON.parse(JSON.stringify(obj))
    },

    ellipsis: function(text, limit = 20, type = 0) {
        text = text || ''
        limit = Math.max(3, parseInt(limit || 20))
        type = parseInt(type || 0) % 3 // [0,2]

        const n = text.length
        const x = n - limit
        if (n <= limit) return text

        switch(type) {
        case 0: // cut the end
            text = text.substr(0, limit-3) + '...'
            break
        case 1: // cut the begin
            text = '...' + text.substr(x+3)
            break
        case 2: // cut in the middle
            const half = Math.floor(limit/2)
            const a = text.substr(0, half)
            const b = text.substr(n - half + 3)
            text = a + '...' + b
            break
        }

        return text
    },

    reverse: function(str) {
        return str.split('').reverse().join('')
    },

    shuffle: function(ar) {
        let currentIndex = ar.length, randomIndex
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex)
            currentIndex--
            [ar[currentIndex], ar[randomIndex]] = [ar[randomIndex], ar[currentIndex]]
        }
        return ar
    },

    setCookie: function(c_name, value, exmins) {
        const expires = new Date()
        expires.setTime(expires.getTime() + (1000 * 60 * exmins))
        const c_value = escape(value) + ((exmins == null) ? "" : " expires=" + expires.toUTCString())
        document.cookie = c_name + "=" + c_value
    },

    getCookie: function(c_name) {
        let i, x, y, cookies = document.cookie.split("")

        for (i=0; i<cookies.length; i++) {
            x=cookies[i].substring(0, cookies[i].indexOf("="))
            y=cookies[i].substring(cookies[i].indexOf("=") + 1)
            x=x.replace(/^\s+|\s+$/g,"")
            if (x == c_name) {
                y = unescape(y)
                if (typeof(y) === 'string' && y == 'null')
                    y = null
                if (typeof(y) === 'string' && y == 'true')
                    y = true
                if (typeof(y) === 'string' && y == 'false')
                    y = false
                return y
            }
        }

        return null
    },

    storageWrite: function(key, data) {
        if (window.localStorage === undefined)
            return false
        try {
            if (!key)
                throw new Error('key is required')
            if (data === undefined) {
                window.localStorage.removeItem(key)
            } else {
                const str = JSON.stringify(data)
                window.localStorage.setItem(key, str)
            }
            return true
        } catch(err) {
            conosle.error('storageWrite', err)
            return false
        }
    },

    storageRead: function(key) {
        if (window.localStorage === undefined)
            return
        try {
            if (!key)
                throw new Error('key is required')
            const data = window.localStorage.getItem(key)
            return data !== null ? JSON.parse(data) : undefined
        } catch(err) {
            conosle.error('storageRead', err)
            return
        }
    },

    loadDataFile: async function(url) {
        try {
            console.log('load data file:', url)
            const response = await fetch(url)
            if (!response.ok)
                throw new Error(`http status: ${response.status}`)
            const data = await response.json()
            return data
        } catch (err) {
            console.error(err)
        }
    },

    simpleHash: function(str) {
        let hash = 0
        if (str.length === 0) return hash
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i)
            hash = ((hash << 5) - hash) + char // Equivalent to hash * 31 + char
            hash = hash & hash // Convert to a 32bit integer
        }
        return hash;
    },

    hasMethod: function(obj, method) {
        if (!obj || !method) return false
        return (method in obj && typeof obj[method] === 'function')
    },

    sleep: function(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    },

    escapeHTML: function(str) {
        const div = document.createElement('div')
        div.textContent = str
        return div.innerHTML
    },

    toBase64: function(str) {
        const encoder = new TextEncoder()
        const bytes = encoder.encode(str)
        let binaryString = ''
        for (let i = 0; i < bytes.length; i++)
            binaryString += String.fromCharCode(bytes[i]);
        return btoa(binaryString)
    },

    fromBase64: function(base64) {
        const binaryString = atob(base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++)
            bytes[i] = binaryString.charCodeAt(i);
        const decoder = new TextDecoder();
        return decoder.decode(bytes);
    },

    durationToText: function(seconds, long) {
        const value = Math.round(seconds)
        const sec = value % 60
        const min = Math.floor(value / 60) % 60
        const hour = Math.floor(value / 3600) % 24
        const day = Math.floor(value / 86400)
        const out = []

        if (!long) {
            if (day)
                out.push(day.toString() + ' ')
            out.push(hour.toString().padStart(2, '0'))
            out.push(':' + min.toString().padStart(2, '0'))
            out.push(':' + sec.toString().padStart(2, '0'))
        } else {
            if (day)
                out.push(`${day} дней`)
            out.push(`${hour} часов`)
            out.push(`${min} мин.`)
            out.push(`${sec} сек.`)
        }

        return out.join('')
    },

    yoSuffix: function(years) {
        years = parseInt(years)
        const tail = years % 10
        let w = 'лет'
        if (tail === 0) ;
        else if (tail === 1) w = 'год'
        else if (tail < 5) w = 'года'
        return w
    }

}
