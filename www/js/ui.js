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
        const utils = window.WfUtils
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
        const details = view.querySelector('.details')
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
                        self.updateImageScale(img, options.pad, options)
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

        let pers

        if (typeof personId === 'object') {
            pers = personId
        } else {
            pers = window.WfWiki.Person(personId)
        }

        if (!pers)
            return

        await pers.load()

        const photo = pers.photo
        if (photo) {
            let url = photo.thumburl || photo.url

            if (details) {
                const persName = pers.name
                const persLink = pers.link
                const eventYear = pers.year
                let s = `<span class="pers-name">${persName}</span>`
                if (eventYear)
                    s += `<span class="event-year">${eventYear}</span>`
                if (persLink)
                    s = `<a class="pers-link" target="_blank" href="${persLink}">${s}</a>`
                details.innerHTML = s
            }

            img.classList.add('loading')
            img.setAttribute('data-pass', 'base64:' + utils.toBase64(personId))
            img.crossOrigin = 'Anonymous'
            img.src = url
        }

        return img
    },

    getImageDetHashKey: function(img) {
        const utils = window.WfUtils
        if (!img)
            throw new Error('image required')
        const hash = utils.simpleHash(img.src)
        const cacheKey = `face-det:${hash}`
        return cacheKey
    },

    updateImageScale: async function(img, pad, options) {
        const utils = window.WfUtils
        const self = window.WfUI

        options = options || {}
        pad = pad || 1.3

        if (!img || !img.src || img.naturalWidth < 1)
            return

        let faceInfo = undefined
        const view = img.closest('.face-slot')
        const atrX = img.getAttribute('data-det-x')
        const atrY = img.getAttribute('data-det-y')
        const atrDiam = img.getAttribute('data-det-diam')

        if (atrX === null || atrX === undefined) {
            const cacheKey = self.getImageDetHashKey(img)
            faceInfo = utils.storageRead(cacheKey)

            if (!faceInfo) {
                view.classList.add('face-detection')
                await utils.sleep(50) // wait for render

                const det = window.WfDetector(img, options.detCustomize)
                faceInfo = await det.detect()
                if (!faceInfo) {
                    faceInfo = {x:0.5, y:0.5, diam:(1.0 / pad)}
                    console.warn('detection failed', img.src)
                }
                utils.storageWrite(cacheKey, faceInfo)
                view.classList.remove('face-detection')
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
        }

        const iw = img.naturalWidth
        const ih = img.naturalHeight
        const rc = view.getBoundingClientRect()
        const vw = rc.width
        const vh = rc.height
        const viewScale = vw / iw

        const detScale = 1.0 / (faceInfo.diam * pad)
        const scale = viewScale * detScale
        let ox = Math.round(0.5 * vw - faceInfo.x * iw * scale)
        let oy = Math.round(0.5 * vh - faceInfo.y * ih * scale)

        // snap to view border
        let st = {x:ox, y:oy, z:scale}
        st = self.validateImagePosition(img, st, {
            minPad: 0.1,
            zoomStep: 0.1,
        })

        // update image style & etc
        img.setAttribute('data-pad', pad)
        img.style.transform = `scale(${st.z})`
        img.style.left = `${st.x}px`
        img.style.top = `${st.y}px`
    },

    getImageTransformState(img) {
        if (!img) return
        let z = 1.0
        const s = img.style.transform
        if (s.startsWith('scale('))
            z = parseFloat(s.substring(6))
        return {
            x: parseInt(img.style.left),
            y: parseInt(img.style.top),
            z: z
        }
    },

    validateImagePosition(img, st, options) {
        if (!img || img.naturalWidth < 1) return
        const view = img.closest('.face-slot')
        if (!view) return

        options = options || {}

        const minPad = options.minPad || 0.1
        const zoomStep = options.zoomStep || 0.1
        const zoomMax = options.zoomMax || 50

        const iw = img.naturalWidth * st.z
        const ih = img.naturalHeight * st.z
        const rc = view.getBoundingClientRect()
        const px = minPad * rc.width
        const py = minPad * rc.height
        const pz = zoomStep * 2

        st.x = Math.min(rc.width - px, st.x)
        st.y = Math.min(rc.height - py, st.y)
        st.x = Math.max(px - iw, st.x)
        st.y = Math.max(py - ih, st.y)
        st.z = Math.max(Math.min(st.z, zoomMax), pz)

        return st
    },

    receiveImageDetParams: function(img, save) {
        const self = window.WfUI
        const utils = window.WfUtils

        if (!img || img.naturalWidth < 1) return
        const view = img.closest('.face-slot')
        if (!view) return

        const pad = parseFloat(img.getAttribute('data-pad'))
        const iw = img.naturalWidth
        const ih = img.naturalHeight
        const rc = view.getBoundingClientRect()
        const vw = rc.width
        const vh = rc.height
        const st = self.getImageTransformState(img)
        const viewScale = vw / iw

        const scale = st.z
        const detScale = scale / viewScale
        const diamPad = 1.0 / detScale
        const diam = diamPad / pad

        const ox = st.x
        const tx = 0.5 * vw - ox
        const x = tx / (iw * scale)

        const oy = st.y
        const ty = 0.5 * vh - oy
        const y = ty / (ih * scale)

        const faceInfo = {x:x, y:y, diam:diam}

        if (save) {
            const cacheKey = self.getImageDetHashKey(img)
            utils.storageWrite(cacheKey, faceInfo)
        }

        return faceInfo
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
            if (w.style.display !== 'none') {
                w.style.display = 'none'
                return true
            }
        }
    },

    bindImageViewer: function(img) {
        if (!img) return
        img.classList.add('button')
        img.setAttribute('data-action', '*viewer')
        // img.setAttribute('data-pass', img.src)
    },

    calcGridSize: function(gridWidth, gridHeight, numItems, aspect) {
        const gridSquare = gridWidth * gridHeight

        if (!gridSquare || !numItems)
            return

        numItems = numItems || 1
        aspect = aspect || (3 / 4)

        const fit = function(stitch, sideA, sideB, asp) {
            let elemA = sideA / stitch
            let elemB = elemA / asp
            let parts = Math.floor(numItems / stitch)
            if (numItems % stitch) parts++
            if (elemB * parts > sideB) {
                elemB = sideB / parts
                elemA = elemB * asp
            }
            return {
                square: elemA * elemB * numItems,
                stitch: stitch,
                parts: parts,
                elemA: elemA,
                elemB: elemB
            }
        }

        const fitByCols = function(cols) {
             const res = fit(cols, gridWidth, gridHeight, aspect)
             return {
                square: res.square,
                cols: res.stitch,
                rows: res.parts,
                width: res.elemA,
                height: res.elemB,
                factor: 'cols',
             }
        }

        const fitByRows = function(rows) {
            const res = fit(rows, gridHeight, gridWidth, 1.0 / aspect)
            return {
                square: res.square,
                cols: res.parts,
                rows: res.stitch,
                width: res.elemB,
                height: res.elemA,
                factor: 'rows',
             }
        }

        let best = undefined
        let maxSquare = -1
        let res

        for (let i=1; i <= numItems; i++) {
        // for (let i=numItems; i > 0; i--) {
            res = fitByCols(i)
            if (res.square > maxSquare) {
                maxSquare = res.square
                best = res
            }
            // res = fitByRows(i)
            // if (res.square > maxSquare) {
            //     maxSquare = res.square
            //     best = res
            // }
        }

        if (best) {
            if (best.square > gridSquare)
                throw new Error('unkown error')
            best.free = 1.0 - best.square / gridSquare
        }

        return best
    },

    Slider: function(con, options) {
        options = options || {}

        const slides = []
        const byName = {}
        const byOrder = []
        const onChangeBefore = options.onChangeBefore || undefined
        const onChangeAfter = options.onChangeAfter || undefined
        let last = undefined

        con.querySelectorAll('.slide').forEach(elem => {
            elem.classList.add('hide')
            const index = byOrder.length
            const s = elem.getAttribute('data-name') || index
            byOrder.push(s)
            byName[s] = elem
            slides.push(elem)
        })

        return {
            getByName(name) {
                if (!(name in byName))
                    throw new Error('unkown slide name: ' + name)
                return byName[name]
            },
            getByIndex(index) {
                const name = byOrder[index]
                return this.getByName(name)
            },
            select(name) {
                if (typeof name === 'string') {
                    this.selectByName(name)
                } else {
                    this.selectByIndex(name)
                }
            },
            selectByName(name) {
                const slide = this.getByName(name)
                const trans = options.transit_class || 'transit-right2left'
                const delay = options.transit_delay || 550
                const old = last
                if (old)
                    old.classList.add('transit-out')
                slide.classList.remove('hide')
                slide.classList.add(trans)
                last = slide
                if (onChangeBefore)
                    onChangeBefore.call(this, old, last)
                setTimeout(function() {
                    Object.values(byName).forEach(x => {
                        if (!x.classList.contains(trans))
                            x.classList.add('hide')
                    })
                    slide.classList.remove(trans)
                    if (old)
                        old.classList.remove('transit-out')
                    if (onChangeAfter)
                        onChangeAfter.call(this, old, last)
                }, delay)
            },
            selectByIndex(index) {
                const name = byOrder[index]
                this.selectByName(name)
            },
            first() {
                this.select(0)
            },
            get count() {
                return byOrder.length
            },
            get currentIndex() {
                return slides.indexOf(last)
            },
            get currentSlide() {
                return last
            },
            next() {
                const num = this.count
                const i = this.currentIndex
                if (i < 0)
                    throw new Error('wrong slider index')
                if (i < num - 1) {
                    this.selectByIndex(i + 1)
                    return true
                }
            }
        }
    }

}