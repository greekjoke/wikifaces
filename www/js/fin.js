/* financial data tools */

(function() {
    const utils = window.WfUtils

    // currency data service
    frankfurter_request = async function(path) {
        try {
            this.requestCounter = (this.requestCounter || 0) + 1
            const tStart = new Date()
            const reqNum = this.requestCounter
            const url = `https://api.frankfurter.dev/v2/${path}`
            console.log(`[${reqNum}] request frankfurter_request url: ${url}`)
            const response = await fetch(url)
            if (!response.ok)
                throw new Error(`http status: ${response.status}`)
            const data = await response.json()
            const time = Math.round(((new Date) - tStart) / 1000)
            console.log(`[${reqNum}] request done in ${time} sec`, data)
            return data
        } catch (err) {
            console.error('fetching data:', err)
        }
    }
    frankfurter_get_currencies = async function() {
        // return array of items like:
        // {
        //     "iso_code": "USD",
        //     "iso_numeric": "840",
        //     "name": "United States Dollar",
        //     "symbol": "$",
        //     "start_date": "1948-06-21",
        //     "end_date": "2026-04-18"
        // }
        return frankfurter_request('currencies')
    }
    frankfurter_get_rates = async function(options) {
        // return array of items like:
        // {date: '2026-04-18', base: 'EUR', quote: 'AED', rate: 4.3281}
        options = options || {}
        let from = options.from || new Date() // inclusive
        let to = options.to || undefined // inclusive

        if (from instanceof Date)
            from = utils.dateYearToText(from)
        if (to instanceof Date)
            to = utils.dateYearToText(to)

        const params = {}
        if (from) params['from'] = from
        if (to) params['to'] = to

        const ticker = options.ticker !== undefined ? options.ticker : 'EUR/USD'
        if (ticker) {
            const [base, quote] = ticker.split('/')
            params['quotes'] = quote
            params['base'] = base
        }

        const paramsRes = []
        Object.entries(params).forEach(([key, value]) => {
            paramsRes.push(`${key}=${value}`)
        })
        return frankfurter_request('rates?' + paramsRes.join('&'))
    }
    frankfurter_get_ticker_hist = async function(ticker, from, to) {
        return frankfurter_get_rates({from:from, to:to, ticker:ticker})
    }

    window.WfFin = {
        test: function() {
            // this.currency_get_hist_for_year('USD/RUB').then(data => {
            //     console.log('rate', data)
            // })
        },
        currency_get_list: frankfurter_get_currencies,
        currency_get_rates: frankfurter_get_rates,
        currency_get_hist: frankfurter_get_ticker_hist,
        currency_get_hist_for_year: async function(ticker, year) {
            const curYear = new Date().getFullYear()

            ticker = ticker || 'EUR/USD'
            year = year || curYear

            let from = year.toString().padStart(4, '0') + '-01-01'
            let to = year.toString().padStart(4, '0') + '-12-31'
            const cacheKey = `fin:currency_by_year:${ticker}:${year}`
            let data = utils.storageRead(cacheKey)

            if (year < curYear) {
                if (data !== undefined)
                    return data
                // TODO: если давно год сменился, данные могут быть не все
                data = await this.currency_get_hist(ticker, from, to)
            } else {
                if (data !== undefined && data.length > 0) {
                    const last = data.at(-1)
                    from = last.date
                }
                const data2 = await this.currency_get_hist(ticker, from)
                if (!data2)
                    return data // no new data or failed
                data = data || []
                data2.forEach(item => {
                    const sim = data.find(x => x.date == item.date)
                    if (sim) {
                        sim.rate = item.rate
                    } else {
                        data.push(item)
                    }
                }, this)
            }
            if (data !== undefined)
                utils.storageWrite(cacheKey, data)
            return data
        }
    } // WfFin
})();