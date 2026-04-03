/* wiki api requests */
const __wfLocalFiles = {}

const __wikiLoadLocalFile = async function(id, url) {
    const data = await WfUtils.loadDataFile(url)
    if (data) {
        __wfLocalFiles[id] = data
        return data
    }
}

__wikiLoadLocalFile('countries', 'data/countries.json')
__wikiLoadLocalFile('occupation', 'data/occupation.json')
__wikiLoadLocalFile('religion', 'data/religion.json')

window.WfWiki = {

    site: 'https://en.wikipedia.org',
    siteWikiData: 'https://www.wikidata.org',
    requestCounter: 0,
    thumbWidth: 500,

    request: async function(url) {
        const self = window.WfWiki
        try {
            self.requestCounter++
            const tStart = new Date()
            const reqNum = self.requestCounter
            console.log(`[${reqNum}] request wiki url: ${url}`)
            const response = await fetch(url)
            if (!response.ok)
                throw new Error(`http status: ${response.status}`)
            const data = await response.json()
            const time = Math.round(((new Date) - tStart) / 1000)
            console.log(`[${reqNum}] request done in ${time} sec`, data)
            if ('warnings' in data) {
                console.error('wiki warnings', data['warnings'])
            } else if ('query' in data) {
                const q = data['query']
                if ('pages' in q) {
                    const firstPage = Object.values(q['pages'])[0]
                    console.log('firstPage', firstPage)
                    if (firstPage) {
                        const info = firstPage['imageinfo']
                        if (info)
                            return info.shift()
                    }
                }
            } else if ('parse' in data) {
                return data['parse']
            } else {
                return data
            }
        } catch (err) {
            console.error('fetching data:', err)
        }
    },

    requestPage: async function(page) {
        const self = window.WfWiki
        if (!page)
            throw new Error('page code is required')
        const url = `${self.site}/w/api.php?action=parse&format=json&origin=*&page=${page}`
        return self.request(url)
    },

    requestSection: async function(page, secIindex) {
        const self = window.WfWiki
        if (!page)
            throw new Error('page code is required')
        const url = `${self.site}/w/api.php?action=parse&origin=*&prop=text&format=json&page=${page}&section=${secIindex}`
        return self.request(url)
    },

    getFileTitle: function(fileNameOrUri) {
        const title = fileNameOrUri.split('File:').pop()
        return title
    },

    getFileCacheKey: function(fileNameOrUri) {
        const self = window.WfWiki
        const title = self.getFileTitle(fileNameOrUri)
        const cacheKey = `wiki.requestFileInfo:${title}`
        return cacheKey
    },

    getFileInfo: function(fileNameOrUri) {
        const self = window.WfWiki

        if (!fileNameOrUri)
            throw new Error('file name is required')

        const cache = window.WfLocalCache
        const cacheKey = self.getFileCacheKey(fileNameOrUri)
        const cachedValue = cache.get(cacheKey)

        return cachedValue
    },

    setFileExtra: function(fileNameOrUri, data) {
        const self = window.WfWiki
        const info = self.getFileInfo(fileNameOrUri)
        if (info) {
            info['extra'] = data
            const cache = window.WfLocalCache
            const cacheKey = self.getFileCacheKey(fileNameOrUri)
            const cachingResult = cache.set(cacheKey, info, cache.Period.Infinite)
            return true
        }
    },

    getFileExtra: function(fileNameOrUri, defValue) {
        const self = window.WfWiki
        const info = self.getFileInfo(fileNameOrUri)
        return (info && 'extra' in info) ? info['extra'] : defValue
    },

    requestFileInfo: async function(fileTitle) {
        const self = window.WfWiki
        const title = self.getFileTitle(fileTitle)
        const url = `${self.site}/w/api.php?action=query&origin=*&prop=imageinfo&format=json&titles=File:${title}&iiprop=url|size|mime|bitdepth&iiurlwidth=500`
        const cache = window.WfLocalCache
        const cacheKey = self.getFileCacheKey(fileTitle)
        const cachedValue = cache.get(cacheKey)

        if (cachedValue) {
            console.log('requestFileInfo: found cached value')
            return cachedValue
        }

        const data = await self.request(url)
        if (!data)
            return

        cache.set(cacheKey, data, cache.Period.Infinite)
        return data
    },

    requestLaureates: async function(page) {
        const self = window.WfWiki
        const cache = window.WfLocalCache
        const cacheKey = `wiki.requestLaureates:${page}`
        const cachedValue = cache.get(cacheKey)

        if (cachedValue) {
            console.log('requestLaureates: found cached value')
            return cachedValue
        }

        const res = await self.requestPage(page)
        if (!res)
            return

        const html_code = res['text']['*']
        const parser = new DOMParser();
        const html = parser.parseFromString(html_code, 'text/html');
        const tables = html.querySelectorAll('.wikitable');

        for (let tab of tables) {
            const headerSize = tab.querySelectorAll('th').length
            if (headerSize >= 5) {
                const res = self.parseTable(tab)
                if (res) {
                    const cachingResult = cache.set(cacheKey, res, cache.Period.Day*20)
                    console.log('requestLaureates: cachingResult', cachingResult)
                    return res
                }
            }
        }
    },

    requestClaims: async function(page, callback) {
        const self = window.WfWiki

        if (!page)
            throw new Error('page code is required')
        if (Array.isArray(page))
            page = page.join('|')

        const url = `${self.siteWikiData}/w/api.php?action=wbgetentities&props=claims&sites=enwiki&titles=${page}&format=json&origin=*`
        const data = await self.request(url)
        if (!data || !('entities' in data))
            return

        function getClaimValue(claims, id) {
            if (claims && (id in claims)) {
                const ar = claims[id]
                if (ar) {
                    const snak = ar[0].mainsnak
                    const valueType = snak.datavalue.type
                    const value = snak.datavalue.value
                    if (valueType == 'time') {
                        // const isoDate = value.time.substring(1, 11)
                        // return new Date(isoDate)
                        return value.time.substring(1)
                    }
                }
            }
        }

        const claimsToRead = {
            birth: 'P569',
            die: 'P570'
        }

        const srcTitles = page.split('|')
        const resKeys = Object.keys(data.entities)
        const result = {}

        for (let i in resKeys) {
            const title = srcTitles[i]
            const id = resKeys[i]
            const item = data.entities[id]
            const claims = item.claims
            const out = {}
            for (let field in claimsToRead) {
                const prop = claimsToRead[field]
                const value = getClaimValue(claims, prop)
                out[field] = value
            }
            result[title] = {
                qid: item.id,
                claims: out
            }
            if (callback)
                callback(title, result[title])
        }

        return result
    },

    parseTable: function(tab) {
        const utils = window.WfUtils
        let lastCountry = ''
        let lastFlag = ''
        const links = []
        const out = []

        const addLink = function(link) {
            let i = links.indexOf(link)
            if (i === -1) {
                i = links.length
                links.push(link)
            }
            return i
        }

        const cleanWikiLink = function(link) {
            if (!link)
                return
            const i = link.indexOf('/wiki/')
            if (i !== -1)
                return link.substring(i)
            return link
        }

        const receivePageTitle = function(link) {
            return link ? link.split('/wiki/').pop() : undefined
        }

        let rowNum = 0
        tab.querySelectorAll('tr').forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td, th'))

            if (cells.length < 2)
                return  // skip separators

            rowNum++
            // console.log('[dev] rowNum', rowNum, tr)

            const yearElem = tr.querySelector('td, th')
            if (yearElem) {
                const yearStr = yearElem.innerText.trim()
                if (utils.isNumeric(yearStr)) {
                    const iYear = parseInt(yearStr)
                    // console.log('[dev] year/number', iYear)
                    out.push({
                        year: iYear,
                        person: []
                    })
                }
            }

            const fileLink = tr.querySelector('a.mw-file-description')
            if (!fileLink) {
                // console.log('[dev] skip no-photo')
                return // skip rows without photo
            }

            let nameElem = undefined
            const fileElem = fileLink.closest('td')
            const fileSibs = []

            if (fileElem.previousElementSibling) {
                const pe = fileElem.previousElementSibling
                if (pe != yearElem && !pe.hasAttribute('rowspan') && !pe.hasAttribute('cellspan')) {
                    fileSibs.push(pe)
                }
            }

            if (fileElem.nextElementSibling) {
                const pe = fileElem.nextElementSibling
                // if (!pe.hasAttribute('rowspan') && !pe.hasAttribute('cellspan')) {
                    fileSibs.push(pe)
                // }
            }

            if (fileSibs.length == 1) {
                nameElem = fileSibs.pop()
            } else if (fileSibs.length > 1) {
                fileSibs.forEach(elem => {
                    if (nameElem) return
                    if (elem.hasAttribute('data-sort-value') || elem.querySelector('[data-sort-value]')) {
                        nameElem = elem
                    }
                })
            }

            if (!nameElem) {
                // console.log('[dev] skip no-name')
                return // skip rows without name
            }

            const flagElem = tr.querySelector('span.flagicon')
            if (flagElem) {
                lastFlag = addLink(flagElem.querySelector('img').src)
                lastCountry = flagElem.closest('td').innerText.trim()
            }

            const last = out[out.length-1]
            const photo = cleanWikiLink(fileLink.href)
            const nameAnchor = nameElem.querySelector('a')
            const name = nameAnchor.innerText.trim()
            const personPage = receivePageTitle(nameAnchor.href)

            if (photo.toLowerCase().indexOf('no_image') !== -1) {
                // console.log('[dev] skip <no_image>')
                return // skip persons without photo
            }

            last.person.push({
                name: name,
                page: personPage,
                photo: photo,
                country: lastCountry,
                flag: lastFlag
            })

            // console.log('[dev] accepted')
        })

        return {
            links: links,
            items: out
        }
    },

    collectPeople(result, shuffle) {
        const utils = window.WfUtils
        let ar = []
        if ('items' in result)
            ar = result.items
        else if (Array.isArray(result))
            ar = result
        ar = ar.map(x => x.person).flat()
        if (shuffle)
            ar = utils.shuffle(ar)
        return ar
    },

    sparql: async function(query, options) {
        const self = window.WfWiki
        const utils = window.WfUtils
        const cache = window.WfLocalCache

        if (!query)
            throw new Error('sparql query string is required')

        options = options || {}

        const hashStr = utils.simpleHash(query)
        const cacheKey = options.noCache ? false : `sparql:${hashStr}`

        if (cacheKey) {
            const cachedValue = cache.get(cacheKey)
            if (cachedValue) {
                console.log('sparql: found cached value')
                return cachedValue
            }
        }

        query = encodeURIComponent(query);
        const uri = `https://query.wikidata.org/sparql?format=json&query=${query}`
        const res = await self.request(uri)

        if (res && cacheKey)
            cache.set(cacheKey, res, cache.Period.Day*20)

        return res
    },

    _sparql_query_wrapper: async function(cacheId, query, handler, options) {
        handler = handler || {}
        options = options || {}

        const cache = window.WfLocalCache
        const cacheKey = `wiki.requestLaureates:${cacheId}`

        if (cacheId) {
            const cachedValue = cache.get(cacheKey)
            if (cachedValue) {
                console.log(`${cacheId}: found cached value`)
                return cachedValue
            }
        }

        const res = await this.sparql(query, {
            noCache: options.noCacheCore || !cacheId
        })

        if (!res || !('head' in res) || !('results' in res))
            return

        let out = {items:[]}

        if (typeof handler === 'object') {
            const byYear = {}
            const colYear = handler.year || 'year'
            const colName = handler.name || 'name'
            const colPage = handler.page || 'fileTitle'
            const colPhoto = handler.photo || 'thumburl'

            for (const item of res['results']['bindings']) {
                let iYear

                if (colYear === '*' || !(colYear in item)) {
                    iYear = (new Date()).getFullYear()
                } else {
                    const col = item[colYear]
                    if (col.type === 'literal') {
                        const d = new Date(col.value)
                        iYear = d.getFullYear()
                    } else {
                        iYear = parseInt(col.value)
                    }
                }

                if (!(iYear in byYear))
                    byYear[iYear] = { year: iYear, person: []}

                const fields = {
                    name: item[colName].value,
                    page: item[colPage].value,
                    photo: item[colPhoto].value
                }

                if (options.addition) {
                    options.addition.forEach(x => {
                        fields[x] = (x in item) ? item[x].value : undefined
                    })
                }

                byYear[iYear].person.push(fields)
            }

            out['items'] = Object.values(byYear)
        } else if (typeof handler === 'function') {
            out = handler(res['results']['bindings'])
        }

        if (options.reverseYear && out && out.items) {
            out.items.reverse()
        }

        if (options.reversePerson && out && out.items) {
            out.items.forEach(x => { x.person.reverse() })
        }

        if (out && cacheId) {
            const cacheExpireIn = options.cacheExpireIn || (cache.Period.Day*20)
            cache.set(cacheKey, out, cacheExpireIn)
        }

        return out
    },

    _sparql_label_code: function(lang) {
        lang = lang || '[AUTO_LANGUAGE],en'
        return `SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang}" . }`
    },

    _sparql_thumb_code: function(width) {
        width = width || this.thumbWidth || 500
        return `
BIND(STRAFTER(wikibase:decodeUri(STR(?image)), "http://commons.wikimedia.org/wiki/Special:FilePath/") AS ?fileTitle)
SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:endpoint "commons.wikimedia.org";
                    wikibase:api "Generator";
                    wikibase:limit "once";
                    mwapi:generator "allpages";
                    mwapi:gapfrom ?fileTitle;
                    mwapi:gapnamespace 6; # NS_FILE
                    mwapi:gaplimit 1;
                    mwapi:prop "imageinfo";
                    mwapi:iiurlwidth ${width};
                    mwapi:iiprop "dimensions|url".
    ?thumburl wikibase:apiOutput "imageinfo/ii/@thumburl"
}`
    },

    _sparql_rand_code: function(seed) {
        const utils = window.WfUtils
        seed = seed || utils.genUid()
        return `BIND(MD5(CONCAT(STR(?image), '${seed}')) as ?randValue)`
    },

    _sparql_item_ids: function(name, options) {
        const utils = WfUtils
        const data = __wfLocalFiles[name]
        if (!data)
            throw new Error(`${name} data not found`)
        options = options || {}
        let codes = data.map(x => `wd:${x.code}`)
        if (options.shuffle)
            codes = utils.shuffle(codes)
        if (options.take)
            codes = codes.slice(0, options.take)
        return codes
    },

    _sparql_countries: function(options) {
        return this._sparql_item_ids('countries', options)
    },

    _sparql_occupation: function(options) {
        return this._sparql_item_ids('occupation', options)
    },

    _sparql_religion: function(options) {
        return this._sparql_item_ids('religion', options)
    },

    _sparql_occupation_by_code: function(code) {
        const ar = __wfLocalFiles['occupation']
        const res = Object.values(ar.filter(x => x.code == code))
        if (res)
            return res[0]
    },

    _sparql_religion_by_code: function(code) {
        const ar = __wfLocalFiles['religion']
        const res = Object.values(ar.filter(x => x.code == code))
        if (res)
            return res[0]
    },

    sparql_award: async function(prizeId) {
        if (!prizeId)
            throw new Error('sparql_award: prizeId is required')
        const args = [...arguments]
        prizeId = args.map(x => `wd:${x}`).join(' ')
        const codeLang = this._sparql_label_code()
        const codeThumb = this._sparql_thumb_code()

        const qSub = `
SELECT ?winner ?year ?image
WHERE {
    ?winner wdt:P166 ?prize;
            wdt:P27 ?ctz;
            wdt:P31 wd:Q5;
            wdt:P18 ?image.
    VALUES ?prize { ${prizeId} }
    OPTIONAL {
        ?winner p:P166 ?statement .
        ?statement ps:P166 ?prize .
        ?statement pq:P585 ?when .
        BIND(YEAR(?when) AS ?year)
    }
}
ORDER BY DESC(?year)
LIMIT 100
`

        const q = `
SELECT ?winnerLabel
    (SAMPLE(?year) AS ?year)
    (SAMPLE(?thumburl) AS ?thumburl)
    (SAMPLE(?fileTitle) AS ?fileTitle)
WHERE {
    { ${qSub} }
    ${codeLang}
    ${codeThumb}
}
GROUP BY ?winnerLabel
ORDER BY DESC(?year) ?winnerLabel
`

        const cacheId = `sparql_award:${prizeId}`
        return await this._sparql_query_wrapper(cacheId, q,
            {name: 'winnerLabel'})
    },

    sparql_president: async function(posId) {
        if (!posId)
            throw new Error('sparql_president: posId is required')
        const codeThumb = this._sparql_thumb_code()
        const q = `
SELECT ?name
  (SAMPLE(?start) as ?start)
  (SAMPLE(?order) as ?order)
  (SAMPLE(?thumburl) as ?thumburl)
WHERE {
  # Instance of 'President of the United States'
  ?president wdt:P39 wd:${posId} ;
             wdt:P31 wd:Q5 ;  # EXCLUDE FICTION: Ensure person is an instance of (P31) human (Q5)
             wdt:P1559 ?name ;
             wdt:P18 ?image . # has a photo
  # Get the term of office
  ?president p:P39 ?statement .
  ?statement ps:P39 wd:${posId} ;
             pq:P1545 ?order ;    # Order in office
             pq:P580 ?start . # Start time
    ${codeThumb}
}
GROUP BY ?name
ORDER BY ASC(xsd:integer(?order))
LIMIT 100
`
        const cacheId = `sparql_president:${posId}`
        return await this._sparql_query_wrapper(cacheId, q, {
            year: 'start',
            page: 'name'
        })
    },

    sparql_richest: async function(num) {
        const codeThumb = this._sparql_thumb_code()
        const codeLang = this._sparql_label_code()
        num = num || 100

        // subquery
        const qSub = `
SELECT ?person
    (SAMPLE(?netWorth) as ?netWorth)
    (SAMPLE(?image) as ?image)
WHERE {
  ?person wdt:P31 wd:Q5 ;  # instance of human
          wdt:P1559 ?name ;  # has name
          wdt:P27 ?ctz;
          wdt:P18 ?image ; # has a photo
          wdt:P2218 ?netWorth. # has net worth property
}
GROUP BY ?person
ORDER BY DESC(?netWorth)
LIMIT ${num}
`

        // final query
        const q = `
SELECT ?personLabel ?netWorth ?thumburl
WHERE {
    { ${qSub} }
    ${codeLang}
    ${codeThumb}
}
ORDER BY DESC(?netWorth)
`

        const cacheId = `sparql_richest:0`
        return await this._sparql_query_wrapper(cacheId, q, {
            name: 'personLabel',
            page: 'personLabel'
        }, { reversePerson: true })
    },

    sparql_serial_killer: async function() {
        const codeLang = this._sparql_label_code()
        const codeThumb = this._sparql_thumb_code()

        // subquery
        const qSub = `
SELECT ?person
    (SAMPLE(?image) as ?image)
    (SAMPLE(?victimCount) as ?victimCount)
    (SAMPLE(?year) as ?year)
WHERE {
  ?person wdt:P31 wd:Q5; # is human
          wdt:P18 ?image; # has a photo
          wdt:P569 ?birthDate;
          wdt:P106 ?occupation; # has occupation info
          wdt:P1345 ?victimCount. # number of victims
  VALUES ?occupation { wd:Q484188 }  # occupation is "serial killer"
  BIND(YEAR(?birthDate) AS ?year)
  FILTER(?year > 1870 && ?victimCount > 1)
}
GROUP BY ?person
ORDER BY DESC(?victimCount) ?personLabel
LIMIT 100
`

        // final query
        const q = `
SELECT ?personLabel ?victimCount ?thumburl ?year
WHERE {
    { ${qSub} }
    ${codeLang}
    ${codeThumb}
}
ORDER BY DESC(?victimCount) ?personLabel
`

        const cacheId = `sparql_serial_killer:0`
        return await this._sparql_query_wrapper(cacheId, q, {
            name: 'personLabel',
            page: 'personLabel'
        }, { reversePerson: true })
    },

    sparql_person_live_or_dead: async function(num, options) {
        const utils = WfUtils
        const cache = window.WfLocalCache

        num = num || 5
        options = options || {}

        const ageMin = options.ageMin || 0
        const ageMax = options.ageMax || 100
        const tCur = new Date()
        const year = tCur.getFullYear()
        const yearMin = year - ageMax
        const yearMax = year - ageMin
        const codeLang = this._sparql_label_code()
        const codeThumb = this._sparql_thumb_code()
        const codeRand = this._sparql_rand_code()
        const countries = this._sparql_countries({ shuffle: true, take: 10 })
        const codeCountries = countries.join(' ')
        const maxOffset = 1000
        const ofsLive = utils.getRandomInt(0, maxOffset)
        const ofsDead = utils.getRandomInt(0, maxOffset)
        const limit = num * 5

        // live people
        const qLive = `
SELECT ?person ?image ?birthDate ("" as ?deathDate)
WHERE {
    ?person wdt:P31 wd:Q5;
        wdt:P27 ?ctz;
        wdt:P18 ?image;
        wdt:P569 ?birthDate.
    ?ctz wdt:P31 wd:Q3624078 .
    VALUES ?ctz { ${codeCountries} }
    FILTER(YEAR(?birthDate) > ${yearMin} && YEAR(?birthDate) < ${yearMax})
    FILTER NOT EXISTS { ?person wdt:P570 ?deathDate }
}
OFFSET ${ofsLive}
LIMIT ${limit}
`

        // dead people
        const qDead = `
SELECT ?person ?image ?birthDate ?deathDate
WHERE {
  ?person wdt:P31 wd:Q5;
        wdt:P27 ?ctz;
        wdt:P18 ?image;
        wdt:P569 ?birthDate;
        wdt:P570 ?deathDate.
    ?ctz wdt:P31 wd:Q3624078 .
    VALUES ?ctz { ${codeCountries} }
    FILTER(YEAR(?birthDate) > ${yearMin} && YEAR(?birthDate) < ${yearMax})
}
OFFSET ${ofsDead}
LIMIT ${limit}
`

        // union
        const arSub = []
        if (options.onlyLiving) {
            arSub.push(qLive)
        } else if (options.onlyDead) {
            arSub.push(qDead)
        } else {
            arSub.push(qLive)
            arSub.push(qDead)
        }
        const arSubStr = arSub.join('} UNION {')
        const codeUnion = `{ ${arSubStr} }`

        // random order
        const qRand = `
SELECT ?person
    (SAMPLE(?image) as ?image)
    (SAMPLE(?randValue) as ?randValue)
    (SAMPLE(?birthDate) as ?birthDate)
    (SAMPLE(?deathDate) as ?deathDate)
WHERE {
    ${codeUnion}
    ${codeRand}
}
GROUP BY ?person
`

        // final query
        const q = `
SELECT ?personLabel ?birthDate ?deathDate ?thumburl ?year
WHERE {
    { ${qRand} }
    BIND(YEAR(?birthDate) AS ?year)
    ${codeLang}
    ${codeThumb}
}
ORDER BY ?randValue
LIMIT ${num}
`

        let cacheId
        if (utils.isLocalhost() && false) { // DEBUG
            console.warn('[wiki] force to use last result')
            cacheId = `sparql_person_live_or_dead:0`
        } else {
            const hashStr = utils.simpleHash(q)
            cacheId = `sparql_person_live_or_dead:${hashStr}`
        }

        return await this._sparql_query_wrapper(cacheId, q, {
            name: 'personLabel',
            page: 'personLabel'
        }, {
            addition: ['birthDate', 'deathDate'],
            cacheExpireIn: cache.Period.Hour * 8,
            noCacheCore: true // don't allow to cache query result
        })
    },

    sparql_person_children: async function(num, options) {
        const utils = WfUtils
        const cache = window.WfLocalCache

        num = num || 5
        options = options || {}

        const ageMin = options.ageMin || 0
        const ageMax = options.ageMax || 100
        const tCur = new Date()
        const year = tCur.getFullYear()
        const yearMin = year - ageMax
        const yearMax = year - ageMin
        const codeLang = this._sparql_label_code()
        const codeThumb = this._sparql_thumb_code()
        const codeRand = this._sparql_rand_code()
        const countries = this._sparql_countries({ shuffle: true, take: 10 })
        const codeCountries = countries.join(' ')
        const maxOffset = 1000
        const ofsWC = utils.getRandomInt(0, maxOffset)
        const ofsWO = utils.getRandomInt(0, maxOffset)
        const limit = num * 10

        // people with children
        const qCoreWC = `
SELECT ?person ?image ?birthDate ?child
WHERE {
    ?person wdt:P31 wd:Q5;
        wdt:P27 ?ctz;
        wdt:P18 ?image;
        wdt:P569 ?birthDate;
        wdt:P40 ?child.
    ?ctz wdt:P31 wd:Q3624078 .
    VALUES ?ctz { ${codeCountries} }
    FILTER(YEAR(?birthDate) > ${yearMin} && YEAR(?birthDate) < ${yearMax})
}
OFFSET ${ofsWC}
LIMIT ${limit}
`

    const qWC = `
SELECT ?person
    (SAMPLE(?image) as ?image)
    (SAMPLE(?birthDate) as ?birthDate)
    (COUNT(?child) as ?childCount)
WHERE {
    ${qCoreWC}
}
GROUP BY ?person`

        // people without children
        const qWO = `
SELECT ?person ?image ?birthDate (0 as ?childCount)
WHERE {
  ?person wdt:P31 wd:Q5;
        wdt:P27 ?ctz;
        wdt:P18 ?image;
        wdt:P569 ?birthDate.
    ?ctz wdt:P31 wd:Q3624078 .
    VALUES ?ctz { ${codeCountries} }
    FILTER(YEAR(?birthDate) > ${yearMin} && YEAR(?birthDate) < ${yearMax})
    FILTER NOT EXISTS { ?person wdt:P40 ?child }
}
OFFSET ${ofsWO}
LIMIT ${limit}
`

        // union
        const arSub = []
        if (options.onlyWC) {
            arSub.push(qWC)
        } else if (options.onlyWO) {
            arSub.push(qWO)
        } else {
            arSub.push(qWC)
            arSub.push(qWO)
        }
        const arSubStr = arSub.join('} UNION {')
        const codeUnion = `{ ${arSubStr} }`

        // random order
        const qRand = `
SELECT ?person
    (SAMPLE(?image) as ?image)
    (SAMPLE(?randValue) as ?randValue)
    (SAMPLE(?birthDate) as ?birthDate)
    (SAMPLE(?childCount) AS ?childCount)
WHERE {
    ${codeUnion}
    ${codeRand}
}
GROUP BY ?person
`

        // final query
        const q = `
SELECT ?personLabel ?birthDate ?deathDate ?thumburl ?year ?childCount
WHERE {
    { ${qRand} }
    BIND(YEAR(?birthDate) AS ?year)
    OPTIONAL { ?person wdt:P570 ?deathDate }
    ${codeLang}
    ${codeThumb}
}
ORDER BY ?randValue
LIMIT ${num}
`

        let cacheId
        if (utils.isLocalhost() && false) { // DEBUG
            console.warn('[wiki] force to use last result')
            cacheId = `sparql_person_children:0`
        } else {
            const hashStr = utils.simpleHash(q)
            cacheId = `sparql_person_children:${hashStr}`
        }

        return await this._sparql_query_wrapper(cacheId, q, {
            name: 'personLabel',
            page: 'personLabel'
        }, {
            addition: ['birthDate', 'childCount'],
            cacheExpireIn: cache.Period.Hour * 8,
            noCacheCore: true // don't allow to cache query result
        })
    },

    sparql_person_occupation: async function(num, options) {
        const that = this
        const utils = WfUtils
        const cache = window.WfLocalCache

        num = num || 5
        options = options || {}

        const ageMin = options.ageMin || 0
        const ageMax = options.ageMax || 100
        const tCur = new Date()
        const year = tCur.getFullYear()
        const yearMin = year - ageMax
        const yearMax = year - ageMin

        const codeLang = this._sparql_label_code()
        const codeThumb = this._sparql_thumb_code()
        const codeRand = this._sparql_rand_code()

        const countriesMax = options.countriesMax || 10
        const countries = this._sparql_countries({ shuffle: true, take: countriesMax })
        const codeCountries = countries.join(' ')

        const occupationMax = options.occupationMax || 10
        const occupation = this._sparql_occupation({ shuffle: true, take: occupationMax })
        const codeOccupation = occupation.join(' ')

        const maxOffset = 1000
        const ofs = utils.getRandomInt(0, maxOffset)
        const limit = num * 10

        if (options.onSelectOccupations) {
            const occups = occupation.map(x => {
                const code = x.split(':').pop()
                return that._sparql_occupation_by_code(code)
            })
            options.onSelectOccupations.call(this, occups)
        }

        // choose people
        const qCore = `
SELECT ?person ?image ?birthDate ?occup
WHERE {
    ?person wdt:P31 wd:Q5;
        wdt:P27 ?ctz;
        wdt:P106 ?occup;
        wdt:P18 ?image;
        wdt:P569 ?birthDate.
    ?ctz wdt:P31 wd:Q3624078 .
    VALUES ?ctz { ${codeCountries} }
    VALUES ?occup { ${codeOccupation} }
    FILTER(YEAR(?birthDate) > ${yearMin} && YEAR(?birthDate) < ${yearMax})
}
OFFSET ${ofs}
LIMIT ${limit}
`

        // random order
        const qRand = `
SELECT ?person
    (SAMPLE(?image) as ?image)
    (SAMPLE(?randValue) as ?randValue)
    (SAMPLE(?birthDate) as ?birthDate)
    (SAMPLE(?occup) as ?occup)
WHERE {
    { ${qCore} }
    ${codeRand}
}
GROUP BY ?person
`

        // final query
        const q = `
SELECT ?personLabel ?birthDate ?deathDate ?thumburl ?year ?occupCode
WHERE {
    { ${qRand} }
    BIND(YEAR(?birthDate) AS ?year)
    ${codeLang}
    ${codeThumb}
    OPTIONAL { ?person wdt:P570 ?deathDate }
    BIND(STRAFTER(wikibase:decodeUri(STR(?occup)), "http://www.wikidata.org/entity/") AS ?occupCode)
}
ORDER BY ?randValue
LIMIT ${num}
`

        let cacheId
        if (utils.isLocalhost() && false) { // DEBUG
            console.warn('[wiki] force to use last result')
            cacheId = `sparql_person_occupation:0`
        } else {
            const hashStr = utils.simpleHash(q)
            cacheId = `sparql_person_occupation:${hashStr}`
        }

        return await this._sparql_query_wrapper(cacheId, q, {
            name: 'personLabel',
            page: 'personLabel'
        }, {
            addition: ['birthDate', 'deathDate', 'occupCode'],
            cacheExpireIn: cache.Period.Hour * 8,
            noCacheCore: true // don't allow to cache query result
        })
    },

    sparql_person_religion: async function(num, options) {
        const that = this
        const utils = WfUtils
        const cache = window.WfLocalCache

        num = num || 5
        options = options || {}

        const ageMin = options.ageMin || 0
        const ageMax = options.ageMax || 100
        const tCur = new Date()
        const year = tCur.getFullYear()
        const yearMin = year - ageMax
        const yearMax = year - ageMin

        const codeLang = this._sparql_label_code()
        const codeThumb = this._sparql_thumb_code()
        const codeRand = this._sparql_rand_code()

        const countriesMax = options.countriesMax || 10
        const countries = this._sparql_countries({ shuffle: true, take: countriesMax })
        const codeCountries = countries.join(' ')

        const religionMax = options.religionMax || 10
        const religion = this._sparql_religion({ shuffle: true, take: religionMax })
        const codeReligion = religion.join(' ')

        const maxOffset = 1000
        const ofs = utils.getRandomInt(0, maxOffset)
        const limit = num * 10

        if (options.onSelectReligions) {
            const res = religion.map(x => {
                const code = x.split(':').pop()
                return that._sparql_religion_by_code(code)
            })
            options.onSelectReligions.call(this, res)
        }

        // choose people
        const qCore = `
SELECT ?person ?image ?birthDate ?relig
WHERE {
    ?person wdt:P31 wd:Q5;
        wdt:P27 ?ctz;
        wdt:P140 ?relig;
        wdt:P18 ?image;
        wdt:P569 ?birthDate.
    ?ctz wdt:P31 wd:Q3624078 .
    VALUES ?ctz { ${codeCountries} }
    VALUES ?relig { ${codeReligion} }
    FILTER(YEAR(?birthDate) > ${yearMin} && YEAR(?birthDate) < ${yearMax})
}
OFFSET ${ofs}
LIMIT ${limit}
`

        // random order
        const qRand = `
SELECT ?person
    (SAMPLE(?image) as ?image)
    (SAMPLE(?randValue) as ?randValue)
    (SAMPLE(?birthDate) as ?birthDate)
    (SAMPLE(?relig) as ?relig)
WHERE {
    { ${qCore} }
    ${codeRand}
}
GROUP BY ?person
`

        // final query
        const q = `
SELECT ?personLabel ?birthDate ?deathDate ?thumburl ?year ?religCode
WHERE {
    { ${qRand} }
    BIND(YEAR(?birthDate) AS ?year)
    ${codeLang}
    ${codeThumb}
    OPTIONAL { ?person wdt:P570 ?deathDate }
    BIND(STRAFTER(wikibase:decodeUri(STR(?relig)), "http://www.wikidata.org/entity/") AS ?religCode)
}
ORDER BY ?randValue
LIMIT ${num}
`

        let cacheId
        if (utils.isLocalhost() && false) { // DEBUG
            console.warn('[wiki] force to use last result')
            cacheId = `sparql_person_religion:0`
        } else {
            const hashStr = utils.simpleHash(q)
            cacheId = `sparql_person_religion:${hashStr}`
        }

        return await this._sparql_query_wrapper(cacheId, q, {
            name: 'personLabel',
            page: 'personLabel'
        }, {
            addition: ['birthDate', 'deathDate', 'religCode'],
            cacheExpireIn: cache.Period.Hour * 8,
            noCacheCore: true // don't allow to cache query result
        })
    },

    sparql_person_relatives: async function(num, options) {
        const that = this
        const utils = WfUtils
        const cache = window.WfLocalCache

        num = num || 5
        options = options || {}

        const ageMin = options.ageMin || 20
        const ageMax = options.ageMax || 70
        const tCur = new Date()
        const year = tCur.getFullYear()
        const yearMin = year - ageMax
        const yearMax = year - ageMin

        const codeLang = this._sparql_label_code()
        const codeThumb = this._sparql_thumb_code()
        const codeRand = this._sparql_rand_code()

        const countriesMax = options.countriesMax || 10
        const countries = this._sparql_countries({ shuffle: true, take: countriesMax })
        const codeCountries = countries.join(' ')

        const maxOffset = 2000
        const ofs = utils.getRandomInt(0, maxOffset)
        const limit = num * 5
        const limitPreFinal = num

        // choose the base person
        const qCore = `
SELECT ?person (?image as ?img)
WHERE {
    ?person wdt:P31 wd:Q5;
        wdt:P18 ?image;
        wdt:P27 ?ctz;
        wdt:P569 ?birthDate.
    ?ctz wdt:P31 wd:Q3624078 .
    VALUES ?ctz { ${codeCountries} }
    FILTER(YEAR(?birthDate) > ${yearMin} && YEAR(?birthDate) < ${yearMax})
    ?person wdt:P22 | wdt:P25 | wdt:P26 | wdt:P40 [] .
}
OFFSET ${ofs}
LIMIT ${limit}
`

        // query part to get relatives
        const qRel = `
SELECT ?type
    (?person as ?personBase)
    (?finalPerson as ?person)
    (SAMPLE(?image) as ?image)
    (SAMPLE(?randValue) as ?randValue)
WHERE {
    { ${qCore} }
    BIND(?person AS ?core).
    BIND(?img AS ?coreImg).
    { BIND(?core AS ?person2). BIND(?coreImg AS ?image2). BIND("self" AS ?type)  } # self
    UNION
    { ?core wdt:P26 ?person2. ?person2 wdt:P18 ?image2. BIND("spouse" AS ?type) } # husband/wife
    UNION
    { ?core wdt:P25 ?person2. ?person2 wdt:P18 ?image2. BIND("mother" AS ?type) } # mother
    UNION
    { ?core wdt:P22 ?person2. ?person2 wdt:P18 ?image2. BIND("father" AS ?type) } # father
    UNION
    { ?core wdt:P40 ?person2. ?person2 wdt:P18 ?image2. BIND("child" AS ?type) } # child
    BIND(COALESCE(?person2, ?core) AS ?finalPerson).
    BIND(COALESCE(?image2, ?coreImg) AS ?image).
    ${codeRand}
}
GROUP BY ?person ?finalPerson ?type
ORDER BY ?personBase
LIMIT ${limitPreFinal}
`

        // final query
        const q = `
SELECT ?personLabel ?birthDate ?deathDate ?thumburl ?year ?baseCode ?personCode ?type
WHERE {
    { ${qRel} }
    ${codeLang}
    ${codeThumb}
    OPTIONAL { ?person wdt:P569 ?birthDate }
    OPTIONAL { ?person wdt:P570 ?deathDate }
    BIND(YEAR(?birthDate) AS ?year)
    BIND(STRAFTER(wikibase:decodeUri(STR(?personBase)), "http://www.wikidata.org/entity/") AS ?baseCode)
    BIND(STRAFTER(wikibase:decodeUri(STR(?person)), "http://www.wikidata.org/entity/") AS ?personCode)
}
ORDER BY ?randValue
LIMIT ${num}
`

        let cacheId
        if (utils.isLocalhost() && false) { // DEBUG
            console.warn('[wiki] force to use last result')
            cacheId = `sparql_person_relatives:0`
        } else {
            const hashStr = utils.simpleHash(q)
            cacheId = `sparql_person_relatives:${hashStr}`
        }

        return await this._sparql_query_wrapper(cacheId, q, {
            name: 'personLabel',
            page: 'personLabel'
        }, {
            addition: ['birthDate', 'deathDate', 'baseCode', 'personCode', 'type'],
            cacheExpireIn: cache.Period.Hour * 8,
            noCacheCore: true // don't allow to cache query result
        })
    },

    getCachedCollections: function() {
        const out = {}
        const cache = window.WfLocalCache
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('wiki.requestLaureates:')) {
                const value = cache.get(key)
                out[key] = value
            }
        });
        return out
    },

    getCachedCollections: function() {
        const out = {}
        const cache = window.WfLocalCache
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('wiki.requestLaureates:')) {
                const value = cache.get(key)
                out[key] = value
            }
        });
        return out
    },

    /* Person data model & methods */
    Person: function(pageTitle) {
        const wiki = window.WfWiki
        const cache = window.WfLocalCache
        const cacheKey = `wiki.Person:${pageTitle}`
        const cacheExpire = cache.Period.Day * 15
        let colPerson = {}
        let needLoad = true

        function findInCollections(pageTitle) {
            const all = wiki.getCachedCollections()
            for (let cid in all) {
                const col = all[cid]
                for (let i in col.items) {
                    const item = col.items[i]
                    for (let j in item.person) {
                        if (item.person[j].page === pageTitle) {
                            return {
                                person: item.person[j],
                                year: item.year
                            }
                        }
                    }
                }
            }
        }

        async function load() {
            if (!needLoad)
                return

            if (colPerson.photo.indexOf('/File:') !== -1) {
                const fileInfo = await wiki.requestFileInfo(colPerson.photo)
                if (fileInfo) {
                    colPerson['photo_orig'] = fileInfo
                }
                // const ext = await wiki.requestClaims(colPerson.page)
                // if (ext) {
                //     colPerson['ext'] = ext
                // }
            } else {
                colPerson['photo_orig'] = {
                    url: colPerson.photo
                }
            }

            cache.set(cacheKey, colPerson, cacheExpire)
            needLoad = false
            return true
        }

        const cachedValue = cache.get(cacheKey)
        if (cachedValue) {
            colPerson = cachedValue
            needLoad = false
        } else {
            const foundPers = findInCollections(pageTitle)
            if (foundPers) {
                colPerson = foundPers.person
                colPerson['year'] = foundPers.year
            } else {
                colPerson = undefined
            }
        }

        if (!colPerson) {
            console.warn(`person "${pageTitle}" not found in cached collections`)
            return
        }

        return {
            load: async function() {
                return await load()
            },
            get photo() {
                return colPerson['photo_orig']
            },
            get name() {
                return colPerson.name
            },
            get year() {
                return colPerson.year
            },
            get link() {
                return wiki.site + '/wiki/' + colPerson.name.replaceAll(' ', '_')
            }
        }
    } // Person

}