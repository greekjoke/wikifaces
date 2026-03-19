/* UI tools */

window.WfUI = {

    getContainer: function(modal) {
        modal = modal || false
        if (modal)
            return document.getElementById('modal-content')
        const elem = undefined // document.getElementById('layout-content')
        return elem || document.getElementById('content')
    },

    addFaceSlot: async function(personId, options) {
        options = options || {}

        const self = window.WfUI
        const tplId = 'tpl-face-slot'
        const tpl = document.getElementById(tplId)

        if (!tpl)
            throw new Error(`template not found: ${tplId}`)

        const con = options.container || self.getContainer()
        const div = document.createElement('div')
        div.classList.add('face-slot-wrapper')
        div.innerHTML = tpl.innerHTML
        con.appendChild(div)

        const view = div.querySelector('.face-slot')
        const img = view.querySelector('img')

        img.onload = async function() {
            // self.updateImageScale(img)
            let resizeTimer = undefined
            const resizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    clearTimeout(resizeTimer)
                    resizeTimer = setTimeout(function() {
                        const img = entry.target.querySelector('img')
                        self.updateImageScale(img, options.pad)
                    }, 800)
                }
            })
            resizeObserver.observe(view)
            img.classList.remove('loading')
            img.classList.add('loaded')
        }

        img.onerror = function() {
            if (!img.classList.contains('loading'))
                return
            img.classList.remove('loading')
            img.classList.add('error')
        }

        if (!personId)
            return

        const pers = window.WfWiki.Person(personId)

        if (!pers)
            return

        await pers.load()
        const photo = pers.photo
        if (photo) {
            let url = photo.thumburl || photo.url

            // const fileExt = url.split('.').pop().toLowerCase()
            // if (['jpeg', 'jpg', 'png', 'gif'].indexOf(fileExt) === -1) {
            //     url = photo.thumburl || url
            // }

            img.classList.add('loading')
            img.crossOrigin = 'Anonymous'
            img.src = url
        }
    },

    updateImageScale: async function(img, pad) {
        const utils = window.WfUtils

        pad = pad || 1.3

        if (!img || !img.src || img.naturalWidth < 1)
            return

        let faceInfo = undefined
        const atrX = img.getAttribute('data-det-x')
        const atrY = img.getAttribute('data-det-y')
        const atrDiam = img.getAttribute('data-det-diam')

        if (atrX === null || atrX === undefined) {
            const hash = utils.simpleHash(img.src)
            const cacheKey = `face-det:${hash}`
            faceInfo = utils.storageRead(cacheKey)

            if (!faceInfo) {
                const det = window.WfDetector(img)
                faceInfo = await det.detect()
                if (!faceInfo) {
                    faceInfo = {x:0.5, y:0.5, diam:(1.0 / pad)}
                    console.warn('detection failed', img.src)
                } else {
                    // console.log('detection result', faceInfo)
                }
                utils.storageWrite(cacheKey, faceInfo)
            }

            img.setAttribute('data-det-x', faceInfo.x)
            img.setAttribute('data-det-y', faceInfo.y)
            img.setAttribute('data-det-diam', faceInfo.diam)
        } else {
            faceInfo = {
                x: parseFloat(atrX),
                y: parseFloat(atrY),
                diam: parseFloat(atrDiam)
            }
            // console.log('detection in attributes', faceInfo)
        }

        const iw = img.naturalWidth
        const ih = img.naturalHeight
        const view = img.closest('.face-slot')
        const vw = view.clientWidth
        const vh = view.clientHeight
        const viewScale = vw / iw

        const detScale = 1.0 / (faceInfo.diam * pad)
        const scale = viewScale * detScale
        let ox = Math.round(0.5 * vw - faceInfo.x * iw * scale)
        let oy = Math.round(0.5 * vh - faceInfo.y * ih * scale)

        // snap to view border
        const iRight = Math.round(vw - iw * scale)
        const iBottom = Math.round(vh - ih * scale)
        ox = Math.min(0, ox) // snap to left border
        oy = Math.min(0, oy) // snap to top border
        ox = Math.max(iRight, ox) // snap to right border
        oy = Math.max(iBottom, oy) // snap to bottom border

        // update image style & etc
        img.style.transform = `scale(${scale})`
        img.style.left = `${ox}px`
        img.style.top = `${oy}px`
    },

    selectLayout: function(name, options) {
        options = options || {}

        console.log('selectLayout', name, options)

        const self = window.WfUI
        const layoutId = `tpl-layout-${name}`
        const tpl = document.getElementById(layoutId)

        if (!tpl) {
            if (options.silent)
                return
            throw new Error(`layout template not found: ${layoutId}`)
        }

        const con = self.getContainer(options.modal)
        const div = document.createElement('div')
        div.classList.add('layout-wrapper')
        div.setAttribute('data-layout', name)
        div.setAttribute('data-pass', options.pass || '')
        div.innerHTML = tpl.innerHTML
        con.innerHTML = '' // reset
        con.appendChild(div)

        if (options.modal) {
            const atrTitle = tpl.getAttribute('data-title')
            self.showModal(atrTitle)
        } else {
            document.body.setAttribute('data-layout', name)
        }

        return {
            root: div,
            buttons: div.querySelectorAll('button[data-action]'),
            container: con,
            pass: options.pass
        }
    },

    showModal: function(title) {
        const w = document.getElementById('modal-wrapper')
        if (w) {
            w.style.display = 'block'
            const titleElem = document.querySelector('#modal-title > span')
            if (titleElem) {
                if (title) {
                    titleElem.textContent = title
                    titleElem.parentElement.style.display = 'inherit'
                } else {
                    titleElem.parentElement.style.display = 'none'
                }
            }
        }
    },

    hideModal: function() {
        const w = document.getElementById('modal-wrapper')
        if (w) {
            w.style.display = 'none'
        }
    }

}