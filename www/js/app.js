/* main application logic */

window.WfApp = function(settings) {
    settings = settings || {}

    let app = undefined
    const ui = window.WfUI
    const utils = window.WfUtils
    const wiki = window.WfWiki
    const collections = settings.collections || {}
    const games = settings.games || {}
    let applet = []
    let globalApplet = undefined

    function initLayout(name, pass, layoutData) {
        if (!layoutData)
            return
        const con = layoutData.container
        let action = `initLayout_${name}`
        action = action.replaceAll('-', '_');
        if (utils.hasMethod(app, action)) {
            app[action].call(app, con, pass)
        }
    }

    function showLayout(name, pass) {
        const opt = { pass: pass }
        const layoutData = ui.selectLayout(name, opt)
        applet = [] // reset
        initLayout(name, pass, layoutData)
    }

    function showModal(name, pass) {
        const layoutData = ui.selectLayout(name, {
            modal: true,
            pass: pass
        })
        initLayout(name, pass, layoutData)
    }

    function setProgressText(text) {
        const elem = document.querySelector('.layout-wrapper[data-layout="progress"] .progress-text')
        if (elem && text) {
            elem.innerText = text
        }
    }

    function updateUserOptions() {
        const all = globalApplet.readOption('user-options') || {}
        for (let key in all) {
            const value = all[key]
            document.body.setAttribute(`data-option-${key}`, value)
        }
    }

    function getTopApplet() {
        return applet ? applet.at(-1) : undefined
    }

    function buildIconHtml(desc) {
        if (!desc) return
        if (desc.startsWith('media/') || desc.startsWith('http'))
            return `<img class="icon" src="${desc}" />`
        return desc
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

        const args = action.split('|')
        action = args.shift()
        args.push(elem)

        if (action.startsWith(':')) { // global/app scape
            action = action.substring(1)
            if (utils.hasMethod(app, action)) {
                app[action].apply(app, args)
            } else {
                throw new Error('invalid function name: app.' + action)
            }
        } else if (action.startsWith('.')) { // applet method
            action = action.substring(1)
            const topApplet = getTopApplet()
            if (utils.hasMethod(topApplet, action)) {
                topApplet[action].apply(topApplet, args)
            }
        } else if (action.startsWith('*')) { // show modal layout
            action = action.substring(1)
            showModal(action, pass)
        } else if (action.startsWith('http:') || action.startsWith('https:')) {
            window.open(action, '_blank').focus();
        } else { // show layout
            showLayout(action, pass)
        }
    })

    document.body.addEventListener('keyup', function(event) {
        // console.log('keyup', event.key)
        const action = 'onKeyup'
        const topApplet = getTopApplet()
        if (utils.hasMethod(topApplet, action)) {
            topApplet[action].call(topApplet, event.key, event)
        }
    })

    document.body.addEventListener('wheel', function(event) {
        const action = 'onWheel'
        const topApplet = getTopApplet()
        if (utils.hasMethod(topApplet, action)) {
            topApplet[action].call(topApplet, event.deltaY, event)
        }
    }, { passive: true });

    document.body.addEventListener('mousedown', function(event) {
        const elem = event.target
        if (!elem.classList.contains('draggable'))
            return
        const ox = event.clientX - parseInt(elem.style.left)
        const oy = event.clientY - parseInt(elem.style.top)
        elem.setAttribute('data-drag-ox', ox)
        elem.setAttribute('data-drag-oy', oy)
        elem.classList.add('dragging')
    })

    document.body.addEventListener('mousemove', function(event) {
        const elem = event.target
        if (!elem.classList.contains('dragging'))
            return
        const ox = parseInt(elem.getAttribute('data-drag-ox') || 0)
        const oy = parseInt(elem.getAttribute('data-drag-oy') || 0)
        const nx = event.clientX - ox;
        const ny = event.clientY - oy;
        const pos = {x:nx, y:ny}

        const action = 'onDragging'
        const topApplet = getTopApplet()
        if (utils.hasMethod(topApplet, action)) {
            const res = topApplet[action].call(topApplet, elem, pos)
            if (res === false)
                return // prevent to change position
        }

        elem.style.left = `${pos.x}px`;
        elem.style.top = `${pos.y}px`;
    })

    document.body.addEventListener('mouseup', function(event) {
        document.querySelectorAll('.dragging').forEach(x => {
            x.classList.remove('dragging')
        })
    })

    app = {
        AppletBase: AppletBase,
        getCollectionsInfo: function() { return collections },
        getGamesInfo: function() { return games },
        loadCollection: async function(id) {
            if (!(id in collections))
                throw new Error(`invalid collection ID: ${id}`)
            let res = []
            const col = collections[id]
            if (col.query) {
                const queryParts = col.query.split('|')
                const method = queryParts.shift()
                const methodFull = `sparql_${method}`
                if (utils.hasMethod(wiki, methodFull)) {
                    res = await wiki[methodFull].apply(wiki, queryParts)
                } else {
                    console.error(`unknown wiki method: ${methodFull}`)
                }
            } else if (col.page) {
                res = await wiki.requestLaureates(col.page)
            }
            return res
        },
        getCollectionIcon: function(cid) {
            if (!(cid in collections))
                throw new Error(`invalid collection id: ${cid}`)
            const col = collections[cid]
            return buildIconHtml(col.icon)
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
            if (ui.hideModal()) {
                const a = getTopApplet()
                if (a && a.isModal()) {
                    applet.pop() // remove top
                }
            }
        },
        showProgress: function(text) {
            showModal('progress')
            setProgressText(text)
        },
        hideProgress: function() {
            this.close()
        },
        setProgressText: setProgressText,
        resetCache: function() {
            if (!confirm('Все настройки будут сброшены в значения по умолчанию. Продолжить?'))
                return
            localStorage.clear()
            document.location.href = ''
        },
        changeUserOption: function() {
            const optName = this.getAttribute('data-name')
            if (!optName) return
            const all = globalApplet.readOption('user-options') || {}
            all[optName] = !!this.checked
            globalApplet.saveOption('user-options', all)
            updateUserOptions()
        },
        initLayout_settings: function(con) {
            con.querySelectorAll('[data-name]').forEach(elem => {
                const name = elem.getAttribute('data-name')
                let value = document.body.getAttribute(`data-option-${name}`) || undefined
                if (value === 'true') value = true
                if (value === 'false') value = false
                if (elem.tagName == 'INPUT') {
                    elem.checked = !!value
                }
            });
        },
        initLayout_collections: function(con) {
            const list = con.querySelector('.collections-list')
            if (!list)
                return
            html = ''
            for (let code in collections) {
                const item = collections[code]
                const action = 'collection-explorer'
                const iconHtml = this.getCollectionIcon(code)
                const icon = (iconHtml || '') + (iconHtml ? '&nbsp;' : '')
                const title = `${icon}${item.title}`
                html += '<li>' +
                    `<button data-action="${action}" data-pass="${code}">${title}</button>` +
                    '</li>'
            }
            list.innerHTML = html
        },
        initLayout_collection_explorer: function(con, cid) {
            const a = new CollectionExplorer(app, cid)
            applet.push(a)
            a.load()
        },
        initLayout_viewer: async function(con, personId) {
            const target = con.querySelector('#image-viewer')
            if (personId.startsWith('base64:')) {
                personId = utils.fromBase64(personId.substring(7))
            }
            target.innerHTML = '' // clear
            const img = await ui.addFaceSlot(personId, { container: target })
            if (!img) return
            const view = img.closest('.face-slot')
            const tools = con.querySelector('.image-editor-sidebar')
            if (!view || !tools) return
            view.appendChild(tools) // move toolbar to the face slot
            const a = new ImageViewer(app, view)
            applet.push(a)
        },
        initLayout_playground: async function(con) {
            const list = con.querySelector('.games-list')
            if (!list)
                return
            html = ''
            for (let code in games) {
                const item = games[code]
                const action = item.layout || 'game-launcher'
                const iconHtml = buildIconHtml(item.icon)
                const icon = (iconHtml || '') + (iconHtml ? '&nbsp;' : '')
                const title = `${icon}${item.title}`
                html += '<li>' +
                    `<button data-action="${action}" data-pass="${code}">${title}</button>` +
                    '</li>'
            }
            list.innerHTML = html
        },
        initLayout_game_launcher: async function(con, code) {
            if (!(code in games))
                throw new Error('unknown game code: ' + code)
            const item = games[code]
            const cls = item.class || 'GameBase'
            if (!(cls in window))
                throw new Error('unknown game class: ' + cls)
            const inst = new window[cls](app, item)
            applet.push(inst)
            inst.load()
        }
    }

    globalApplet = new AppletBase(app)
    updateUserOptions()
    return app
}

class AppletBase {
    constructor(app, appletId) {
        this.appletId = appletId || 'default'
        this.app = app
        this.rootElem = document.querySelector('#content .layout-wrapper')
        if (!this.rootElem && this.appletId !== 'default')
            throw new Error('content container not found')
    }
    load() {
        // NOTE: load some data
    }
    render() {
        // NOTE: visualize data
    }
    _getOptionKey(name) {
        return `applet:${this.appletId}:${name}`
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
    isModal() { return false }
    // onKeyup(keyCode) { }
}

class CollectionExplorer extends AppletBase {
    constructor(app, collectionId) {
        super(app,  'CollectionExplorer')
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
        this.setOrder(this.readOption('order', 'desc'))
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
            if (!result) {
                alert('Ошибка при получении данных.')
                app.hideProgress()
                return
            }

            const ar = result.items || result || []
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

        this.setupGrid(part.length)

        for (let i=0; i < part.length; i++) {
            const p = part[i]
            const img = await ui.addFaceSlot(p.page, {
                container: that.listElem,
                pad: that.facePad
            })
            ui.bindImageViewer(img)
        }
    }
    setupGrid(numItems) {
        const pad = 18 // HACK: magic number
        const ui = window.WfUI
        const num = numItems || this.pageSize
        const grid = this.listElem
        const gw = grid.clientWidth - pad * 2
        const gh = grid.clientHeight - pad * 2
        const aspect = 2 / 3
        const res = ui.calcGridSize(gw, gh, num, aspect)
        if (res) {
            const w = Math.floor(res.width) - pad * 0
            const h = Math.floor(res.height) - pad * 0
            grid.style.gridTemplateColumns = `repeat(${res.cols}, ${w}px)`
            grid.style.gridTemplateRows = `repeat(${res.rows}, ${h}px)`
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
        const col = this.app.getCollectionsInfo()[cid]
        const title = col.title || 'Untitled'
        const iconHtml = this.app.getCollectionIcon(cid)
        const icon = (iconHtml || '') + (iconHtml ? '&nbsp;' : '')
        const wikiHost = window.WfWiki.site
        const link = col.link || `${wikiHost}/wiki/${col.page}`
        const linkHtml = link ? ` <a class="icon-link" target="_blank" href="${link}">🔗</a>` : ''
        titleElem.innerHTML = `${icon}${title}${linkHtml}`
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
    onKeyup(keyCode) {
        if (keyCode == 'ArrowLeft') {
            this.pagePrev()
        } else if (keyCode == 'ArrowRight') {
            this.pageNext()
        } else if (keyCode == 'Home') {
            this.pageFirst()
        } else if (keyCode == 'End') {
            this.pageLast()
        } else if (keyCode == '+') {
            this.capMore()
        } else if (keyCode == '-') {
            this.capLess()
        }
    }
} // class CollectionExplorer

class ImageViewer extends AppletBase {
    constructor(app, viewElem) {
        super(app,  'ImageViewer')
        this.viewElem = viewElem
        this.img = viewElem.querySelector('img')
        this.zoomStep = 0.1
        this.moveStep = 20
        this.oldState = undefined
    }
    isModal() { return true }
    isEditMode() {
        return this.viewElem.classList.contains('edit-mode')
    }
    edit() {
        if (!this.isEditMode()) {
            this.viewElem.classList.add('edit-mode')
            this.oldState = this._getImageState()
            this.img.classList.add('draggable')
        }
    }
    _editEnd() {
        this.viewElem.classList.remove('edit-mode')
        this.img.classList.remove('draggable')
    }
    _getImagePad() {
        return parseFloat(this.img.getAttribute('data-pad') || '1.0')
    }
    _getImageState() {
        const ui = window.WfUI
        return ui.getImageTransformState(this.img)
    }
    _setImageState(st) {
        const ui = window.WfUI

        ui.validateImagePosition(this.img, st, {
            zoomStep: this.zoomStep
        })

        this.img.style.left = `${st.x}px`
        this.img.style.top = `${st.y}px`
        this.img.style.transform = `scale(${st.z})`
    }
    orig() {
        this._setImageState({x:0, y:0, z:1})
    }
    fit() {
        const iw = this.img.naturalWidth
        const ih = this.img.naturalHeight
        const rc = this.viewElem.getBoundingClientRect()
        const z = Math.min(rc.width / iw, rc.height / ih)
        this._setImageState({x:0, y:0, z:z})
    }
    zoomIn() {
        const st = this._getImageState()
        st.z += this.zoomStep
        this._setImageState(st)
    }
    zoomOut() {
        const st = this._getImageState()
        st.z -= this.zoomStep
        this._setImageState(st)
    }
    movePos(ox, oy, absolute) {
        absolute = absolute || false
        const st = this._getImageState()
        if (absolute) {
            st.x = ox
            st.y = oy
        } else {
            st.x += ox
            st.y += oy
        }
        this._setImageState(st)
    }
    save() {
        const ui = window.WfUI
        if (!this.isEditMode()) return
        this._editEnd()
        // receive det values & save changes
        const det = ui.receiveImageDetParams(this.img, true)
        // refresh all slots
        const facePad = this._getImagePad()
        const pass = this.img.getAttribute('data-pass')
        document.querySelectorAll(`img[data-pass="${pass}"]`).forEach(elem => {
            elem.setAttribute('data-det-x', det.x)
            elem.setAttribute('data-det-y', det.y)
            elem.setAttribute('data-det-diam', det.diam)
            ui.updateImageScale(elem, facePad)
        })
    }
    cancel() {
        if (!this.isEditMode()) return
        this._editEnd()
        if (this.oldState)
            this._setImageState(this.oldState)
    }
    onKeyup(keyCode) {
        if (!this.isEditMode())
            return
        const mv = this.moveStep
        if (keyCode == 'ArrowLeft') {
            this.movePos(mv, 0)
        } else if (keyCode == 'ArrowRight') {
            this.movePos(-mv, 0)
        } else if (keyCode == 'ArrowUp') {
            this.movePos(0, mv)
        } else if (keyCode == 'ArrowDown') {
            this.movePos(0, -mv)
        } else if (keyCode == '+') {
            this.zoomIn()
        } else if (keyCode == '-') {
            this.zoomOut()
        } else if (keyCode == 'Home') {
            this.fit()
        } else if (keyCode == 'End') {
            this.orig()
        }
    }
    onWheel(delta) {
        if (!this.isEditMode())
            return
        if (delta > 0) {
            this.zoomOut()
        } else if (delta < 0) {
            this.zoomIn()
        }
    }
    onDragging(elem, pos) {
        this.movePos(pos.x, pos.y, true)
        return false // pos already changed
    }
} // class ImageViewer