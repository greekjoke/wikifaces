/* main application logic */

window.WfApp = function(settings) {
    settings = settings || {}

    let app = undefined
    const ui = window.WfUI
    const wiki = window.WfWiki
    const collections = settings.collections || {}

    function showLayout(name, pass) {
        const opt = { pass: pass }
        const layoutData = ui.selectLayout(name, opt)
        if (!layoutData)
            return
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
        if (action.startsWith(':')) {
            action = action.substring(1)
            if (action in app && typeof app[action] === 'function') {
                app[action].call(elem)
            } else {
                throw new Error('invalid function name: app.' + action)
            }
        } else if (action.startsWith('*')) {
            action = action.substring(1)
            showModal(action, pass)
        } else {
            showLayout(action, pass)
        }
    })

    app = {
        loadCollection: async function(id) {
            if (!(id in collections))
                throw new Error(`invalid collection ID: ${id}`)
            const col = collections[id]
            const res = await WfWiki.requestLaureates(col.page)
            console.log('laurs', res)
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
                const title = `🤵&nbsp;${item.title}`
                html += '<li>' +
                    `<button data-action="${action}" data-pass="${code}">${title}</button>` +
                    '</li>'
            }
            list.innerHTML = html
        },
        initLayout_collection_explorer: function(con, cid) {
            const listElem = con.querySelector('.faces-list')

            if (!listElem)
                throw new Error('faces container not found')

            listElem.innerHTML = '' // clear

            app.showProgress()
            app.loadCollection(cid).then(result => {
                const maxSize = 12
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

                const part = all.slice(0, maxSize)
                part.forEach(p => {
                    ui.addFaceSlot(p.page, {
                        container: listElem,
                        pad: 1.4
                    })
                })

                app.hideProgress()
            })
        },
    }

    return app
}
