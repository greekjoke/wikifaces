/* chart renderer */

window.WfChart = function(options) {
    options = options || {}
    const utils = window.WfUtils
    const curData = options.data || [{ date:'2026-01-01', value:1.0 }]
    const container = options.container || document.body

    // create canvas
    const canvas = document.createElement('canvas')
    canvas.width = options.width || 500
    canvas.height = options.height || Math.round(canvas.width * 3 / 2)

    const con = (typeof container === 'string') ?
        document.getElementById(container) : container
    if (con && options.container !== false)
        con.appendChild(canvas)

    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false

    // calculate diagram metrics
    const fontSize = options.fontSize || 10
    const arValues = curData.map(x => x.value)
    const arTimes = curData.map(x => new Date(x.date).getTime())
    const minValue = Math.min(...arValues)
    const maxValue = Math.max(...arValues)
    const minTime = Math.min(...arTimes)
    const maxTime = Math.max(...arTimes)
    const yAxisPad = Math.round(fontSize * 3 / 2)
    const yAxisScale = options.yAxisScale || 0.8
    const yViewOfs = (canvas.height - yAxisPad) * (1.0 - yAxisScale) / 2

    const calcValueRoundParams = function(arValues) {
        const arDeltas = arValues.slice(1)
            .map((x, i) => Math.abs(arValues[i] - x))
            .filter(x => x > 0)
        const minDelta = Math.min(...arDeltas)
        const minDeltaFactor = minDelta > 1 ?
            (1.0 / Math.round(minDelta)) : Math.round(1.0 / minDelta)
        const minValueStep = 1.0 / minDeltaFactor
        const dig= utils.findPowerOf(minDeltaFactor, 10)
        return {
            count: arValues.length,
            delta: minDelta,
            factor: minDeltaFactor,
            step: minValueStep,
            dig: dig,
            round: function(v) {
                const n = Math.round(v / this.step)
                return n * this.step
            }
        }
    }

    const valueParams = calcValueRoundParams(arValues)

    const modelToViewX = function(v) {
        const f = (v - minTime) / (maxTime - minTime)
        return Math.round(f * (canvas.width - xAxisPad))
    }
    const viewToModelX = function(v) {
        const f = v / (canvas.width - xAxisPad)
        return f * (maxTime - minTime) + minTime
    }
    const modelToViewY = function(v) {
        const f = (v - minValue) / (maxValue - minValue)
        return Math.round((1.0 - f) * yAxisScale * (canvas.height - yAxisPad) + yViewOfs)
    }
    const viewToModelY = function(v) {
        const f = (v - yViewOfs) / (yAxisScale * (canvas.height - yAxisPad))
        return (1.0 - f) * (maxValue - minValue) + minValue
    }

    const testV = arValues[0]
    const testY = modelToViewY(testV)
    const testS = testV.toFixed(valueParams.dig)
    const xAxisPad = Math.round(testS.length * fontSize * 2 / 3)

    // calculate points
    const dots = []
    curData.forEach((u, i) => {
        const x = modelToViewX(arTimes[i])
        const y = modelToViewY(arValues[i])
        dots.push([x, y])
    })

    const clearBackground = function() {
        ctx.fillStyle = options.bgStyle || 'black'
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const renderTitle = function(title) {
        const labelFontSize = options.titleFontSize || 28
        const yearStr = curData.at(-1).date.substring(0, 4)
        ctx.font = `${labelFontSize}px sans-serif`
        ctx.fillStyle = options.titleStyle || '#335'
        ctx.fillText(title, 5, labelFontSize)
    }

    const renderXAxis = function() {
        let lastMonth = -1
        const textMinWidth = fontSize * 3
        const textSpanH = Math.max(1, Math.ceil(textMinWidth / ((canvas.width - xAxisPad) / curData.length)))
        const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
        const vGrid = []

        ctx.font = `${fontSize}px sans-serif`
        ctx.fillStyle = options.axisBg || '#333'
        ctx.strokeStyle = options.axisFg || 'white'
        ctx.lineWidth = 0.5
        ctx.fillRect(0, canvas.height - yAxisPad, canvas.width, yAxisPad)
        ctx.fillStyle = options.axisFg || '#aaa'

        for (let i=0; i < curData.length; i += textSpanH) {
            const t = curData[i].date
            const month = parseInt(t.substring(5, 7))
            const day = parseInt(t.substring(8))
            const s = month === lastMonth ? day.toString() : monthNames[month-1]
            const [x, y] = dots[i]
            ctx.fillText(s, x, canvas.height - fontSize / 2)
            lastMonth = month
            vGrid.push(x + 0.5)
        }

        return vGrid
    }

    const renderYAxis = function() {
        const yAxisTop = viewToModelY(0)
        const yAxisBottom = viewToModelY(canvas.height - yAxisPad)
        const yAxisMin = valueParams.round(yAxisBottom)
        const yAxisMax = valueParams.round(yAxisTop)
        const yAxisTicks = Math.round((yAxisMax - yAxisMin) / valueParams.step)
        const textMinHeight = fontSize * 2
        const textSpanV = Math.max(1, Math.ceil(textMinHeight / ((canvas.height - yAxisPad) / yAxisTicks)))
        const hGrid = []

        ctx.font = `${fontSize}px sans-serif`
        ctx.fillStyle = options.axisBg || '#333'
        ctx.strokeStyle = options.axisFg || 'white'
        ctx.lineWidth = 0.5
        ctx.fillRect(canvas.width - xAxisPad, 0, xAxisPad, canvas.height - yAxisPad)
        ctx.fillStyle = options.axisFg || '#aaa'

        for (let i=0; i < yAxisTicks; i += textSpanV) {
            const v = yAxisMin + i * valueParams.step
            const y = modelToViewY(v)
            const s = v.toFixed(valueParams.dig)
            ctx.fillText(s, canvas.width - xAxisPad + 2, y + fontSize / 2)
            hGrid.push(y + 0.5)
        }

        return hGrid
    }

    const renderLastValue = function() {
        const v = arValues.at(-1)
        const y = modelToViewY(v)
        const s = v.toFixed(valueParams.dig)

        ctx.fillStyle = options.lastBg || 'yellow'
        ctx.fillRect(canvas.width - xAxisPad, y - fontSize / 2, xAxisPad, fontSize + 2)

        ctx.fillStyle = options.lastFg || 'black'
        ctx.fillText(s, canvas.width - xAxisPad + 2, y + fontSize / 2)

        ctx.lineWidth = 0.5
        ctx.strokeStyle = options.lastBg || 'yellow'
        ctx.setLineDash([10, 5])
        ctx.beginPath()
        ctx.moveTo(0, y + 0.5)
        ctx.lineTo(canvas.width - xAxisPad, y + 0.5)
        ctx.stroke()
        ctx.setLineDash([])
    }

    const renderVGrid = function(vGrid) {
        ctx.lineWidth = 0.5
        ctx.strokeStyle = options.gridStyle || '#555'
        vGrid.forEach((x, i) => {
            if (i === 0) return // skip first line
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, canvas.height - yAxisPad)
            ctx.stroke()
        })
    }

    const renderHGrid = function(hGrid) {
        ctx.lineWidth = 0.5
        ctx.strokeStyle = options.gridStyle || '#555'
        hGrid.forEach((y, i) => {
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(canvas.width - xAxisPad, y)
            ctx.stroke()
        })
    }

    const renderChartLine = function() {
        ctx.lineWidth = 2
        ctx.strokeStyle = options.chartLineStyle || '#5de'
        ctx.beginPath()
        dots.forEach((u, i) => {
            const [x, y] = u
            if (i < 1) {
                ctx.moveTo(x, y)
            } else {
                ctx.lineTo(x, y)
            }
        })
        ctx.stroke()
    }

    const renderChartDots = function() {
        dots.slice(0, -1).forEach(u => {
            const [x, y] = u

            ctx.beginPath();
            ctx.fillStyle = options.chartDotStyle2 || 'blue'
            ctx.arc(x, y, 4, 0, 2 * Math.PI)
            ctx.fill()

            ctx.beginPath();
            ctx.fillStyle = options.chartDotStyle || '#5de'
            ctx.arc(x, y, 2, 0, 2 * Math.PI)
            ctx.fill()
        })
    }

    return {
        canvas: canvas,
        render: function() {
            clearBackground()
            if (options.title)
                renderTitle(options.title)
            const vGrid = renderXAxis()
            const hGrid = renderYAxis()
            renderLastValue()
            renderVGrid(vGrid)
            renderHGrid(hGrid)
            renderChartLine()
            renderChartDots()
        },
        makeURL: function() {
            return canvas.toDataURL('image/png')
        }
    }

} // WfChart
