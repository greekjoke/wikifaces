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
    static CARD_STATE = {
        ask: 'ask',
        valid: 'valid',
        invalid: 'invalid',
    }
    constructor(app, gameId, desc, options) {
        super(app,  gameId || 'GameBase')

        this.options = options || {}
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

        this.maxTests = this.options.maxTests || 5
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
        let con

        if (this.rootElem.classList.contains('slider')) {
            con = this.rootElem
        } else {
            con = this.rootElem.querySelector('.slider')
        }

        if (!con)
            return

        const cardElem = con.querySelector('.slide[data-name="card"]')
        const items = [cardElem]
        let lastElem = cardElem

        for (let i=2; i <= this.maxTests; i++) {
            const newElem = cardElem.cloneNode(true)
            newElem.setAttribute('data-name', `card${i}`)
            lastElem.after(newElem)
            lastElem = newElem
            items.push(lastElem)
        }

        con.querySelectorAll('.slide.card').forEach(elem => {
            this._initCard(elem)
        });

        this.slider = WfUI.Slider(con)
    }
    _createButton(text, action, id) {
        id = id || '0'
        const bn = document.createElement('button')
        bn.innerHTML = text || 'Кнопка'
        bn.setAttribute('data-action', action || '.skip')
        bn.setAttribute('data-id', id.toString())
        return bn
    }
    _initCardButtons(con, card) {
        con.innerHTML = '' // clear
        con.appendChild(this._createButton('Да', '.answer|yes', 1))
        con.appendChild(this._createButton('Нет', '.answer|no', 2))
    }
    _initCardContent(con, card) {
        con.innerHTML = card.getAttribute('data-name')
    }
    _initCard(elem) {
        let con = elem.querySelector('.buttons')
        this._initCardButtons(con, elem)
        con = elem.querySelector('.content')
        this._initCardContent(con, elem)
    }
    _resetCards() {
        this.rootElem.querySelectorAll('.slide.card').forEach(elem => {
            this._setCardState(GameBase.CARD_STATE.ask, '', elem)
        });
    }
    _setCardState(state, byButton, cardElem) {
        if (!this.slider) return
        byButton = byButton || ''
        state = state || GameBase.CARD_STATE.ask
        cardElem = cardElem || this.slider.currentSlide
        cardElem.setAttribute('data-button', byButton)
        cardElem.setAttribute('data-state', state)
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
        this._resetCards()
        this._refreshStat()
        if (this.slider) {
            this.slider.first()
        }
    }
    start() {
        if (this.isOn())
            return
        this.round = this._newRoundInstance()
        this.round.init()
        this.setRoundsStarted(this.started + 1)
        if (this.slider) {
            this.slider.select('card')
        }
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
    answer(value, bnElem) {
        if (!this.isOn())
            return

        const bnId = bnElem ? bnElem.getAttribute('data-id') : ''

        if (value === undefined) {
            this.round.acceptSkip()
        } else if (this._validate(value)) {
            this._setCardState(GameBase.CARD_STATE.valid, bnId)
            this.round.acceptPassed()
        } else {
            this._setCardState(GameBase.CARD_STATE.invalid, bnId)
            this.round.acceptFailed()
        }

        if (!this.round.hasTests) {
            this.finish()
        } else if (this.slider) {
            this.slider.next()
        }
    }
    skip() {
        this.answer() // call without value
    }
    _validate(value) {
        return false // implement logic in extends
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
    constructor(app, desc) {
        super(app, 'GameAliveOrDead', desc, {maxTests:5})
    }
    _validate(value) {
        // TODO:
        return value === 'yes'
    }
    load() {
        super.load()
        // TODO: age from 5 to 90 yo
    }
} // class GameAliveOrDead

window['GameAliveOrDead'] = GameAliveOrDead // register
