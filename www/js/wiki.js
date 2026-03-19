/* wiki api requests */

window.WfWiki = {

    site: 'https://en.wikipedia.org',
    siteWikiData: 'https://www.wikidata.org',
    requestCounter: 0,

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
                    const info = q['pages'][-1]['imageinfo']
                    if (info)
                        return info.shift()
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

        tab.querySelectorAll('tr').forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td, th'))

            if (cells.length < 2)
                return  // skip separators

            const yearElem = tr.querySelector('td, th')
            if (yearElem) {
                const yearStr = yearElem.innerText.trim()
                if (utils.isNumeric(yearStr)) {
                    out.push({
                        year: parseInt(yearStr),
                        person: []
                    })
                }
            }

            const fileLink = tr.querySelector('a.mw-file-description')
            if (!fileLink)
                return // skip rows without photo

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
                if (!pe.hasAttribute('rowspan') && !pe.hasAttribute('cellspan')) {
                    fileSibs.push(pe)
                }
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

            if (!nameElem)
                return // skip rows without name

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

            if (photo.toLowerCase().indexOf('no_image') !== -1)
                return // skip persons without photo

            last.person.push({
                name: name,
                page: personPage,
                photo: photo,
                country: lastCountry,
                flag: lastFlag
            })
        })

        return {
            links: links,
            items: out
        }
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
                            return item.person[j]
                        }
                    }
                }
            }
        }

        async function load() {
            if (!needLoad)
                return

            const fileInfo = await wiki.requestFileInfo(colPerson.photo)
            if (fileInfo) {
                // TODO: check that photo jpg or png
                colPerson['photo_orig'] = fileInfo
            }

            // const ext = await wiki.requestClaims(colPerson.page)
            // if (ext) {
            //     colPerson['ext'] = ext
            // }

            cache.set(cacheKey, colPerson)
            needLoad = false
            return true
        }

        const cachedValue = cache.get(cacheKey, false, cache.Period.Day*15)
        if (cachedValue) {
            colPerson = cachedValue
            needLoad = false
        } else {
            colPerson = findInCollections(pageTitle)
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
            }
        }
    }

}