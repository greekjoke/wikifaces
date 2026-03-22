/* wiki api requests */

window.WfWiki = {

    site: 'https://en.wikipedia.org',
    siteWikiData: 'https://www.wikidata.org',
    requestCounter: 0,
    thumbWidth: 500,

    request: async function(url) {
        const self = window.WfWiki
        try {
            self.requestCounter++
            const reqNum = self.requestCounter
            console.log(`[${reqNum}] request wiki url: ${url}`)
            const response = await fetch(url)
            if (!response.ok)
                throw new Error(`http status: ${response.status}`)
            const data = await response.json()
            console.log(`[${reqNum}] request done`, data)
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
        const cachedValue = cache.get(cacheKey, undefined, cache.Period.Infinite)

        return cachedValue
    },

    setFileExtra: function(fileNameOrUri, data) {
        const self = window.WfWiki
        const info = self.getFileInfo(fileNameOrUri)
        if (info) {
            info['extra'] = data
            const cache = window.WfLocalCache
            const cacheKey = self.getFileCacheKey(fileNameOrUri)
            const cachingResult = cache.set(cacheKey, info)
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
        const cachedValue = cache.get(cacheKey, false, cache.Period.Infinite)

        if (cachedValue) {
            console.log('requestFileInfo: found cached value')
            return cachedValue
        }

        const data = await self.request(url)
        if (!data)
            return

        const cachingResult = cache.set(cacheKey, data)
        console.log('requestFileInfo: cachingResult', fileTitle, data)
        return data
    },

    requestLaureates: async function(page) {
        const self = window.WfWiki
        const cache = window.WfLocalCache
        const cacheKey = `wiki.requestLaureates:${page}`
        const cachedValue = cache.get(cacheKey, false, cache.Period.Day*20)

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
                    const cachingResult = cache.set(cacheKey, res)
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

    sparql: async function(query) {
        const self = window.WfWiki
        const utils = window.WfUtils
        const cache = window.WfLocalCache

        if (!query)
            throw new Error('sparql query string is required')

        const hashStr = utils.simpleHash(query)
        const cacheKey = `sparql:${hashStr}`
        const cachedValue = cache.get(cacheKey, false, cache.Period.Day * 20)

        if (cachedValue) {
            console.log('sparql: found cached value')
            return cachedValue
        }

        query = encodeURIComponent(query);
        const uri = `https://query.wikidata.org/sparql?format=json&query=${query}`
        const res = await self.request(uri)

        if (res)
            cache.set(cacheKey, res)

        return res
    },

    _sparql_query_wrapper: async function(cacheId, query, handler) {
        handler = handler || {}

        const cache = window.WfLocalCache
        const cacheKey = `wiki.requestLaureates:${cacheId}`
        const cachedValue = cache.get(cacheKey, false, cache.Period.Day*20)

        if (cachedValue) {
            console.log(`${cacheId}: found cached value`)
            return cachedValue
        }

        const res = await this.sparql(query)

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

                byYear[iYear].person.push({
                    name: item[colName].value,
                    page: item[colPage].value,
                    photo: item[colPhoto].value
                })
            }

            out['items'] = Object.values(byYear)
        } else if (typeof handler === 'function') {
            out = handler(res['results']['bindings'])
        }

        if (out)
            cache.set(cacheKey, out)
        return out
    },

    _sparql_label_code: function(lang) {
        lang = lang || 'en'
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
    # ?size wikibase:apiOutput "imageinfo/ii/@size".
    # ?width wikibase:apiOutput "imageinfo/ii/@width".
    # ?height wikibase:apiOutput "imageinfo/ii/@height".
    # ?url wikibase:apiOutput "imageinfo/ii/@url".
    ?thumburl wikibase:apiOutput "imageinfo/ii/@thumburl"
}`
    },

    sparql_award: async function(prizeId) {
        if (!prizeId)
            throw new Error('sparql_award: prizeId is required')

        const codeLang = this._sparql_label_code()
        const codeThumb = this._sparql_thumb_code()
        const q = `
SELECT ?winnerLabel ?year
    (SAMPLE(?thumburl) AS ?thumburl)
    (SAMPLE(?fileTitle) AS ?fileTitle)
WHERE {
  ?winner wdt:P166 ?prize ; # P166 is "award received"
          wdt:P31 wd:Q5 ;  # EXCLUDE FICTION: Ensure winner is an instance of (P31) human (Q5)
          wdt:P18 ?image . # has a photo
  # Filter to prize type and related awards
  VALUES ?prize { wd:${prizeId} }  # prize type
  # Optional: get the year the award was received
  # The "point in time" qualifier (P585) on the P166 statement
  OPTIONAL {
    ?winner p:P166 ?statement .
    ?statement ps:P166 ?prize .
    ?statement pq:P585 ?when .
    BIND(YEAR(?when) AS ?year)
  }
  ${codeLang}
  ${codeThumb}
}
GROUP BY ?winnerLabel ?year
ORDER BY ?year ?winnerLabel
LIMIT 500
`
        const cacheId = `sparql_award:${prizeId}`
        return await this._sparql_query_wrapper(cacheId, q, {name: 'winnerLabel'})
    },

    sparql_president: async function(posId) {
        if (!posId)
            throw new Error('sparql_president: posId is required')

        const codeLang = this._sparql_label_code()
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
  ${codeLang}
  ${codeThumb}
}
GROUP BY ?name
ORDER BY ASC(xsd:integer(?order))
LIMIT 500
`
        const cacheId = `sparql_president:${posId}`
        return await this._sparql_query_wrapper(cacheId, q, {
            year: 'start',
            page: 'name'
        })
    },

    sparql_richest: async function() {
        const codeThumb = this._sparql_thumb_code()
        const q = `
SELECT ?name
  (SAMPLE(?netWorth) as ?netWorth)
  (SAMPLE(?thumburl) as ?thumburl)
WHERE {
  ?person wdt:P31 wd:Q5 ;  # Instance of human
          wdt:P1559 ?name ;
          wdt:P18 ?image ; # has a photo
          wdt:P2218 ?netWorth. # Has net worth property
  ${codeThumb}
}
GROUP BY ?name
ORDER BY DESC(?netWorth)
LIMIT 100
`
        const cacheId = `sparql_richest:0`
        const out = await this._sparql_query_wrapper(cacheId, q, {
            page: 'name'
        })
        if (out && out.items) {
            const ar = out.items[0].person
            if (ar) {
                ar.reverse()
            }
        }
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

            cache.set(cacheKey, colPerson)
            needLoad = false
            return true
        }

        const cachedValue = cache.get(cacheKey, false, cache.Period.Day*15)
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