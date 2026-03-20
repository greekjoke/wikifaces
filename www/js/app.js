/* main application logic */

window.WfApp = function(settings) {
    settings = settings || {}

    let app = undefined
    const ui = window.WfUI
    const wiki = window.WfWiki
    const collections = settings.collections || {}
    let game = undefined

    function showLayout(name, pass) {
        const opt = { pass: pass }
        const layoutData = ui.selectLayout(name, opt)
        if (!layoutData)
            return
        game = undefined // reset
        const con = layoutData.container
        let action = `initLayout_${name}`
        action = action.replaceAll('-', '_');
        if (action in app && typeof app[action] === 'function') {
            app[action].call(app, con, pass)
        }
    }

    function showModal(name, pass) {
        ui.selectLayout(name, {
            modal: true,
            pass: pass
        })
    }

    function setProgressText(text) {
        const elem = document.querySelector('.layout-wrapper[data-layout="progress"] .progress-text')
        if (elem) {
            elem.innerText = text || 'Загрузка...'
        }
    }

    console.log('app starts...')

    document.body.addEventListener('click', function(event) {
        const elem = event.target
        if (elem.tagName !== 'BUTTON' && !elem.classList.contains('button'))
            return
        const pass = elem.getAttribute('data-pass')
        let action = elem.getAttribute('data-action')
        if (!action)
            return
        if (action.startsWith(':')) { // global/app scape
            action = action.substring(1)
            if (action in app && typeof app[action] === 'function') {
                app[action].call(elem)
            } else {
                throw new Error('invalid function name: app.' + action)
            }
        } else if (action.startsWith('.')) { // game method
            action = action.substring(1)
            if (action in game && typeof game[action] === 'function') {
                game[action].call(game, elem)
            }
        } else if (action.startsWith('*')) { // show modal layout
            action = action.substring(1)
            showModal(action, pass)
        } else { // show layout
            showLayout(action, pass)
        }
    })

    app = {
        GameBase: GameBase,
        getCollectionsInfo: function() {
            return collections
        },
        loadCollection: async function(id) {
            if (!(id in collections))
                throw new Error(`invalid collection ID: ${id}`)
            const col = collections[id]
            const res = await wiki.requestLaureates(col.page)
            return res
        },
        selectLayout: function(name, modal, pass) {
            if (modal) {
                showModal(name, pass)
            } else {
                showLayout(name, pass)
            }
        },
        navBack: function() {
            showLayout('main')
        },
        close: function() {
            ui.hideModal()
        },
        showProgress: function(text) {
            showModal('progress')
            setProgressText(text)
        },
        hideProgress: function() {
            app.close()
        },
        setProgressText: setProgressText,
        resetCache: function() {
            if (!confirm('Все настройки будут сборшены в значения по умолчанию. Продолжить?'))
                return
            localStorage.clear()
            document.location.href = ''
        },
        initLayout_collections: function(con) {
            const list = con.querySelector('.collections-list')
            if (!list)
                return
            html = ''
            for (let code in collections) {
                const item = collections[code]
                const action = 'collection-explorer'
                const icon = (item.icon || '') + (item.icon ? '&nbsp;' : '')
                const title = `${icon}${item.title}`
                html += '<li>' +
                    `<button data-action="${action}" data-pass="${code}">${title}</button>` +
                    '</li>'
            }
            list.innerHTML = html
        },
        initLayout_collection_explorer: function(con, cid) {
            game = new GameExplorer(app, cid)
            game.load()
        },
    }

    return app
}

class GameBase {
    constructor(app, gameId) {
        this.gameId = gameId
        this.app = app
        this.rootElem = document.querySelector('#content .layout-wrapper')
        if (!this.rootElem)
            throw new Error('content container not found')
    }
    load() {
        // NOTE: load some data
    }
    render() {
        // NOTE: visualize data
    }
    _getOptionKey(name) {
        return `game:${this.gameId}:${name}`
    }
    saveOption(name, value) {
        const utils = window.WfUtils
        const key = this._getOptionKey(name)
        utils.storageWrite(key, value)
    }
    readOption(name, defValue) {
        const utils = window.WfUtils
        const key = this._getOptionKey(name)
        const value = utils.storageRead(key)
        return value === undefined ? defValue : value
    }
}

class GameExplorer extends GameBase {
    constructor(app, collectionId) {
        super(app,  'GameExplorer')
        if (!collectionId)
            throw new Error('collection id required')
        const listElem = this.rootElem.querySelector('.faces-list')
        if (!listElem)
            throw new Error('faces container not found')
        this.listElem = listElem
        this.collectionId = collectionId
        this.capacitySizes = [1, 2, 4, 8, 16, 24, 32]
        this.capacityCur = this.readOption('cap', 2)
        this.facePad = 1.4
        this.pageCur = 0
        this.data = []
        this.dataMixed = undefined
        this.clear()
        this.setOrder(this.readOption('order', 'asc'))
        this.updatePaginator()
        this.updateCapacity()
        this.updateTitle()
    }
    get pageSize() {
        return this.capacitySizes[this.capacityCur]
    }
    clear() {
        this.listElem.innerHTML = '' // clear view
    }
    load() {
        super.load();

        const app = this.app
        const that = this

        that.data = []
        this.dataMixed = undefined

        app.showProgress()
        app.loadCollection(this.collectionId).then(result => {
            const ar = result.items
            const cnt = ar.length
            const all = []

            for (let i=0; i < cnt; i++) {
                const item = ar[i]
                const pers = item.person
                const numPers = pers.length
                for (let j=0; j < numPers; j++) {
                    all.push(pers[j])
                }
            }

            that.data = all
            that.render()
            that.updatePaginator()

            app.hideProgress()
        })
    }
    async render() {
        super.render();

        const that = this
        const ui = window.WfUI
        const utils = window.WfUtils
        const order = this.getOrder()
        let ar = (this.data || []).slice() // copy

        if (order === 'shuffle') {
            if (!this.dataMixed)
                this.dataMixed = utils.shuffle(ar)
            ar = this.dataMixed
        } else if (order === 'desc') {
            ar = ar.reverse()
        }

        this.clear()

        const skip = this.pageSize * this.pageCur
        const part = ar.slice(skip, skip + this.pageSize)

        for (let i=0; i < part.length; i++) {
            // TODO: why doubles at first loading?
            const p = part[i]
            await ui.addFaceSlot(p.page, {
                container: that.listElem,
                pad: that.facePad
            })
        }
    }
    getOrder() {
        return this.rootElem.getAttribute('data-order')
    }
    setOrder(value) {
        const old = this.getOrder()
        if (old === value) return
        this.rootElem.setAttribute('data-order', value)
        this.saveOption('order', value)
        this.render()
    }
    orderAsc() {
        this.setOrder('asc')
    }
    orderDesc() {
        this.setOrder('desc')
    }
    orderShuffle() {
        this.setOrder('shuffle')
    }
    getPagesCount() {
        const ar = (this.data || [])
        const num = Math.floor(ar.length / this.pageSize)
        if (ar.length % this.pageSize)
            return num + 1
        return num
    }
    pageFirst() {
        if (this.pageCur > 0) {
            this.pageCur = 0
            this.render()
        }
        this.updatePaginator()
    }
    pageLast() {
        const num = this.getPagesCount()
        if (this.pageCur < (num-1)) {
            this.pageCur = num-1
            this.render()
        }
        this.updatePaginator()
    }
    pagePrev() {
        if (this.pageCur > 0) {
            this.pageCur--
            this.render()
        }
        this.updatePaginator()
    }
    pageNext() {
        const num = this.getPagesCount()
        if (this.pageCur < (num-1)) {
            this.pageCur++
            this.render()
        }
        this.updatePaginator()
    }
    updatePaginator() {
        const num = this.getPagesCount()
        if (num <= 1)
            this.rootElem.setAttribute('data-pag', 'empty')
        else if (this.pageCur < 1)
            this.rootElem.setAttribute('data-pag', 'noless')
        else if (this.pageCur >= (num-1))
            this.rootElem.setAttribute('data-pag', 'nomore')
        else
            this.rootElem.setAttribute('data-pag', '')
    }
    updateTitle() {
        const cid = this.collectionId
        const titleElem = this.rootElem.querySelector('.toolbar .title')
        const colMeta = this.app.getCollectionsInfo()[cid]
        const title = colMeta.title || 'Untitled'
        const icon = (colMeta.icon || '') + (colMeta.icon ? '&nbsp;' : '')
        const wikiHost = window.WfWiki.site
        const link = colMeta.link || `${wikiHost}/wiki/${colMeta.page}`
        titleElem.innerHTML = `${icon}${title} <a class="icon-link" target="_blank" href="${link}">🔗</a>`
    }
    capLess() {
        if (this.capacityCur > 0) {
            this.pageCur = 0
            this.capacityCur--
            this.saveOption('cap', this.capacityCur)
            this.render()
        }
        this.updateCapacity()
        this.updatePaginator()
    }
    capMore() {
        const num = this.capacitySizes.length
        if (this.capacityCur < (num-1)) {
            this.pageCur = 0
            this.capacityCur++
            this.saveOption('cap', this.capacityCur)
            this.render()
        }
        this.updateCapacity()
        this.updatePaginator()
    }
    updateCapacity() {
        const num = this.capacitySizes.length
        if (this.capacityCur < 1)
            this.rootElem.setAttribute('data-cap', 'noless')
        else if (this.capacityCur >= (num-1))
            this.rootElem.setAttribute('data-cap', 'nomore')
        else
            this.rootElem.setAttribute('data-cap', '')
        this.rootElem.setAttribute('data-capv', this.pageSize)
    }
} // class GameExplorer
