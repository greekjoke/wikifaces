/* games */

class RoundBase {
    static PRIZE_PER_ONE = 10
    static PRIZE_PER_ROUND = 50

    constructor(game, numTests) {
        this.game = game // GameBase
        this.numTests = parseInt(numTests || 0) // total tests count
        this.passed = 0 // passed tests
        this.skipped = 0 // skipped test
        this.cur = 0 // cur test index
    }
    get testIndex() { return this.cur }
    get passedTestsCount() { return this.passed }
    get totalTestsCount() { return this.numTests }
    get hasTests() { return this.cur < this.numTests }
    get duration() {
        const t = new Date()
        return (t - this.created) // in milliseconds
    }
    _resultScore() {
        const num = this.numTests
        if (!num) return 0
        let score = 0
        score += this.passed * RoundBase.PRIZE_PER_ONE
        score += (num === this.passed) ? RoundBase.PRIZE_PER_ROUND : 0
        return score
    }
    init() {
        this.cur = 0
        this.passed = 0
        this.created = new Date()
    }
    finalize() {
        const score = this._resultScore()
        console.log('FINALIZE', this.cur, this.passed)
        if (score > 0) {
            this.game.addScore(score)
        }
    }
    next() {
        if (this.hasTests) {
            this.cur++
            return true
        }
    }
    acceptSkip() {
        this.skipped++
        this.next()
    }
    acceptFailed() {
        this.next()
    }
    acceptPassed() {
        this.passed++
        this.next()
    }
} // class RoundBase

class GameBase extends AppletBase {
    constructor(app, gameId, desc) {
        super(app,  gameId || 'GameBase')
        this.desc = desc || {}
        this.title = this.desc.title || 'Безымянная игра'
        this.logo = this.desc.logo || undefined

        const elemTitle = this.rootElem.querySelector('.game-title')
        if (elemTitle) {
            elemTitle.innerHTML = this.title
        }

        const elemLogo = this.rootElem.querySelector('.logo')
        if (elemLogo && this.logo) {
            const img = document.createElement('img')
            img.src = this.logo
            elemLogo.innerHTML = ''
            elemLogo.appendChild(img)
        }

        this.maxTests = 5
        this.score = this.readOption('score', 0)
        this.scoreLast = this.readOption('scoreLast', 0)
        this.started = this.readOption('started', 0)
        this.finished = this.readOption('finished', 0)
        this.duration = this.readOption('duration', 0)
        this.round = undefined // RoundBase
        this.slider = undefined

        const tmp = this._newRoundInstance()
        const numTests = tmp.numTests || 'бесконечного числа'
        if (desc.intro) {
            const introText = desc.intro.replace('{numTests}', numTests)
            this.setIntroInfo(introText)
        }

        this._initSlider()
        this.intro()
    }
    _initSlider() {
        let sld
        if (this.rootElem.classList.contains('slider')) {
            sld = this.rootElem
        } else {
            sld = this.rootElem.querySelector('.slider')
        }
        if (!sld) return
        this.slider = WfUI.Slider(sld)
    }
    _newRoundInstance() {
        return new RoundBase(this, this.maxTests)
    }
    setIntroInfo(text) {
        const elem = this.rootElem.querySelector('.slide[data-name="intro"] > .info, .info')
        if (elem) {
            elem.innerHTML = text
        }
    }
    setIntroStat(text) {
        const elem = this.rootElem.querySelector('.slide[data-name="intro"] > .stat, .stat')
        if (elem) {
            elem.innerHTML = text
        }
    }
    setScore(value) {
        this.score = value
        this.saveOption('score', this.score)
    }
    setScoreLast(value) {
        this.scoreLast = value
        this.saveOption('scoreLast', this.scoreLast)
    }
    addScore(delta) {
        this.setScore(delta + this.score)
    }
    setRoundsStarted(value) {
        this.started = value
        this.saveOption('started', this.started)
    }
    setRoundsFinished(value) {
        this.finished = value
        this.saveOption('finished', this.finished)
    }
    setRoundsTime(value) {
        this.duration = value
        this.saveOption('duration', this.duration)
    }
    isOn() {
        return !!this.round
    }
    intro() {
        this._refreshStat()
        if (this.slider)
            this.slider.first()
    }
    start() {
        if (this.isOn())
            return
        this.round = this._newRoundInstance()
        this.round.init()
        this.setRoundsStarted(this.started + 1)
        if (this.slider)
            this.slider.select('round')
    }
    finish() {
        if (!this.isOn())
            return
        const scoreOld = this.score
        this.round.finalize()
        this.setScoreLast(this.score - scoreOld)
        this.setRoundsFinished(this.finished + 1)
        const ms = this.round.duration
        this.setRoundsTime(this.duration + ms)
        if (this.slider)
            this.slider.select('summary')
        this.round = undefined
    }
    answer(value) {
        if (!this.isOn())
            return

        if (value === undefined) {
            this.round.acceptSkip()
        } else if (this._validate(value)) {
            this.round.acceptPassed()
        } else {
            this.round.acceptFailed()
        }

        if (!this.round.hasTests) {
            this.finish()
        }
    }
    skip() {
        this.answer() // call without value
    }
    _validate(value) {
        // NOTE: implement this logic in extends
        return false
    }
    _refreshStat() {
        const utils = WfUtils
        let out = []

        const line = function(text, value) {
            if (typeof value === 'number') {
                value = Math.round(value)
            }
            out.push('<div class="stat-line">' +
                `<span class="text">${text}</span><span class="num">${value}</span>` +
                '</div>')
        }

        if (this.score) {
            const scoreAvg = this.score / this.finished
            line('Очки за последний раунд', this.scoreLast)
            line('Очки за все раунды', this.score)
            line('Средние очки за раунд', scoreAvg)
        }

        if (this.started) {
            if (this.finished)
                line('Сыграно раундов всего', this.finished)
            const abandoned = this.started - this.finished
            if (abandoned > 0)
                line('Брошенных раундов', abandoned)
        }

        const secTotal = 0.001 * this.duration
        if (secTotal > 0) {
            const secAvg = secTotal / this.finished
            line('Время затраченное на игру', utils.durationToText(secTotal))
            line('Среднее время на раунд', utils.durationToText(secAvg))
        }

        if (out) {
            this.setIntroStat(out.join(''))
        } else {
            this.setIntroStat('')
        }
    }
} // class GameBase

window['GameBase'] = GameBase // register

class GameAliveOrDead extends GameBase {
    // age from 5 to 90 yo
    constructor(app, desc) {
        super(app, 'GameAliveOrDead', desc)
    }
    _validate(value) {
        return value === 'yes'
    }
} // class GameAliveOrDead

window['GameAliveOrDead'] = GameAliveOrDead // register
