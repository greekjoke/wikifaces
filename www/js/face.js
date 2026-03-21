/* face detection utils */
let facefinderClassifyRegion = undefined
const facefinderClassifyRegionFallback = function(r, c, s, pixels, ldim) {return -1.0}

const __ffrLoader = async function() {
    try {
        // download the face-detection cascade
        const url = 'data/facefinder';
        const response = await fetch(url)
        if (!response.ok)
            throw new Error(`http status: ${response.status}`)
        const buffer = await response.arrayBuffer()
        const bytes = new Int8Array(buffer);
        const clsRegion = pico.unpack_cascade(bytes);
        console.log('cls region loaded')
        facefinderClassifyRegion = clsRegion
        return clsRegion
    } catch (err) {
        console.error('fetching data:', err)
    }
}

__ffrLoader()

window.WfDetector = function(image, options) {
    if (!image)
        throw new Error('image is required')

    options = options || {}

    const canvas = document.getElementById('canvas')
    if (!canvas)
        throw new Error('canvas not found')

    async function touchClsRegion() {
        return facefinderClassifyRegion || facefinderClassifyRegionFallback
    }

    function rgba2gray(rgba, nrows, ncols) {
        var gray = new Uint8Array(nrows * ncols)
        for (let r=0; r < nrows; ++r)
            for (let c=0; c<ncols; ++c)
                // gray = 0.2*red + 0.7*green + 0.1*blue
                gray[r*ncols + c] = (2*rgba[r*4*ncols+4*c+0]+7*rgba[r*4*ncols+4*c+1]+1*rgba[r*4*ncols+4*c+2])/10
        return gray
    }

    function ffrParamsDefault() {
        return {
            'shiftfactor': 0.1, // move the detection window by 10% of its size
            'minsize': 20,      // minimum size of a face (not suitable for real-time detection, set it to 100 in that case)
            'maxsize': 1000,    // maximum size of a face
            'scalefactor': 1.1  // for multiscale processing: resize the detection window by 10% when moving to the higher scale
        }
    }

    function ffrParamsPortrait() {
        return {
            'shiftfactor': 0.05,
            'minsize': 80,
            'maxsize': 1200,
            'scalefactor': 1.1
        }
    }

    function ffrParamsLandscape() {
        return {
            'shiftfactor': 0.02,
            'minsize': 10,
            'maxsize': 800,
            'scalefactor': 1.1
        }
    }

    function ffrParamsBigFace() {
        return {
            'shiftfactor': 0.2,
            'minsize': 120,
            'maxsize': 1500,
            'scalefactor': 1.1
        }
    }

    function ffrParamsSmallFace() {
        return {
            'shiftfactor': 0.05,
            'minsize': 10,
            'maxsize': 1200,
            'scalefactor': 1.1
        }
    }

    return {
        detect: async function(allowMultiple) {
            allowMultiple = allowMultiple || false

            const out = []
            const clsReg = await touchClsRegion()
            const w = image.naturalWidth
            const h = image.naturalHeight
            const aspect = w / h
            const isPortrait = aspect < 1.0
            const isSquare = Math.abs(aspect - 1.0) < 0.1
            const maxWidth = 500
            const targetWidth = Math.min(w, maxWidth)
            const targetHeight = parseInt(h * (targetWidth / w))

            canvas.width = targetWidth
            canvas.height = targetHeight

            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(image, 0, 0, targetWidth, targetHeight)
            var rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data

			// prepare input to `run_cascade`
			const desc = {
				'pixels': rgba2gray(rgba, canvas.height, canvas.width),
				'nrows': canvas.height,
				'ncols': canvas.width,
				'ldim': canvas.width
			}

            const qthresh = 5.0 // this constant is empirical: other cascades might require a different one
            const iouDefault = 0.2

            const dpPort = {
                title: 'portrait',
                params: ffrParamsPortrait(),
                qthresh: qthresh,
                iou: iouDefault
            }

            const dpLand = {
                title: 'landscape',
                params: ffrParamsLandscape(),
                qthresh: qthresh,
                iou: iouDefault
            }

            const dpBig = {
                title: 'big',
                params: ffrParamsBigFace(),
                qthresh: qthresh,
                iou: iouDefault
            }

            const dpSmall = {
                title: 'small',
                params: ffrParamsSmallFace(),
                qthresh: qthresh,
                iou: iouDefault
            }

            let params, dets
            let best= undefined
            let bestScore = -1

            if (options.dpCustom) {
                params = [options.dpCustom]
            } else if (isPortrait) {
                params = [dpPort, dpSmall, dpLand, dpBig]
            } else if (isSquare) {
                params = [dpBig, dpSmall, dpPort, dpLand]
            } else {
                params = [dpLand, dpSmall, dpPort, dpBig]
            }

            for (let curParamItem of params) {
                const thr = curParamItem.qthresh || qthresh
                const iou = curParamItem.iou || 0.2

                // run the cascade over the image
                // dets is an array that contains (r, c, s, q) quadruplets
                // (representing row, column, scale and detection score)
                dets = pico.run_cascade(desc, clsReg, curParamItem.params)
                // cluster the obtained detections
                dets = pico.cluster_detections(dets, iou) // set IoU threshold to 0.2

                for (let i=0; i < dets.length; ++i) {
                    const item = dets[i]
                    // check the detection score
                    // if it's above the threshold, take it
                    if (item[3] > thr) {
                        const pos = {
                            x: item[1] / canvas.width,
                            y: item[0] / canvas.height,
                            diam: item[2] / canvas.width,
                            score: item[3]
                        }
                        if (item[3] > bestScore) {
                            if (curParamItem.title)
                                image.setAttribute('data-det-set', curParamItem.title)
                            bestScore = item[3]
                            best = pos
                        }
                        out.push(pos)
                    }
                }

                if (best)
                    break
            }

            return allowMultiple ? out : best
        }
    }
}
