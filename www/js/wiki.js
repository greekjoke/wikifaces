/* wiki api requests */

window.WfWiki = {

    request: async function(url) {
        try {
            console.log(`request wiki url: ${url}`)
            const response = await fetch(url)
            if (!response.ok)
                throw new Error(`http status: ${response.status}`)
            const data = await response.json()
            console.log('request done')
            if ('warnings' in data) {
                console.error('wiki warnings', data['warnings'])
            } else {
                return data['parse']
            }
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

        const parseTab = function(tab) {
            const mapFull = { year: 0, photo: 1, name: 2, country: 3 }
            const mapShort = { photo: 0, name: 1, country: 2 }
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
                const cells = Array.from(tr.querySelectorAll('td'))
                const fullRow = cells.length === 6
                const im = fullRow ? mapFull : mapShort

                if (cells.length < 2)
                    return  // skip separator

                if (fullRow) { // full row
                    out.push({
                        year: parseInt(cells[im.year].innerText),
                        person: []
                    })
                }

                const last = out[out.length-1]
                const name = cells[im.name].innerText.trim()
                const photoLink = cells[im.photo].querySelector('a')

                if (!photoLink)
                    return // skip persons without photo

                if (im.country < cells.length) {
                    const td = cells[im.country]
                    const flag = td.querySelector('.flagicon')
                    if (flag) {
                        lastCountry = td.innerText.trim()
                        lastFlag = addLink(flag.querySelector('img').src)
                    }
                }

                last.person.push({
                    name: name,
                    photo: cleanFileLink(photoLink.href),
                    country: lastCountry,
                    flag: lastFlag
                })
            })

            return {
                links: links,
                items: out
            }
        }

        for (let tab of tables) {
            const headerSize = tab.querySelectorAll('th').length
            if (headerSize >= 5) {
                const res = parseTab(tab)
                if (res) {
                    // const cachingResult = cache.set(cacheKey, res)
                    // console.log('cachingResult', cachingResult)
                    return res
                }
            }
        }
    }

}