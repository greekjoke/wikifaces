/* wiki api requests */

window.WfWiki = {

    request: async function(url) {
        try {
            console.log(`request wiki url: ${url}`)
            const response = await fetch(url)
            if (!response.ok)
                throw new Error(`http status: ${response.status}`)
            const data = await response.json()
            console.log('request done', data)
            if ('warnings' in data) {
                console.error('wiki warnings', data['warnings'])
            } else if ('query' in data) {
                const q = data['query']
                if ('pages' in q) {
                    const info = q['pages'][-1]['imageinfo']
                    if (info)
                        return info.shift()
                }
            }
            return data['parse']
        } catch (err) {
            console.error('fetching data:', err)
        }
    },

    requestPage: async function(page) {
        const self = window.WfWiki
        if (!page)
            throw new Error('page code is required')
        const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&page=${page}`
        return self.request(url)
    },

    requestSection: async function(page, secIindex) {
        const self = window.WfWiki
        if (!page)
            throw new Error('page code is required')
        const url = `https://en.wikipedia.org/w/api.php?action=parse&origin=*&prop=text&format=json&page=${page}&section=${secIindex}`
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
        const url = `https://en.wikipedia.org/w/api.php?action=query&origin=*&prop=imageinfo&format=json&titles=File:${title}&iiprop=url|size|mime|bitdepth`
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
        console.log('requestFileInfo: cachingResult', cachingResult)
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
                    const cachingResult = cache.set(cacheKey, res)
                    console.log('requestLaureates: cachingResult', cachingResult)
                    return res
                }
            }
        }
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

        const cleanFileLink = function(link) {
            const i = link.indexOf('/wiki/')
            if (i !== -1)
                return link.substring(i)
            return link
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
            const photo = cleanFileLink(fileLink.href)
            const name = nameElem.querySelector('a').innerText.trim()

            if (photo.toLowerCase().indexOf('no_image') !== -1)
                return // skip persons without photo

            last.person.push({
                name: name,
                photo: photo,
                country: lastCountry,
                flag: lastFlag
            })
        })

        return {
            links: links,
            items: out
        }
    }

}