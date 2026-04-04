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
        this.score = 0
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
        this.score = this._resultScore()
        if (this.score > 0) {
            this.game.addScore(this.score)
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
    constructor(app, desc, options, gameId) {
        super(app,  gameId || 'GameBase')

        this.options = options || {}
        this.desc = desc || {}
        this.title = this.desc.title || 'Безымянная игра'
        this.logo = this.desc.logo || undefined
        this.buttons = options.buttons || {
            0: 'Далее', // 0|false == Skip button
            1: 'Да',
            2: 'Нет',
        }

        this._refreshTitle()

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
        this.beforeSlideDelay = 1500
        this.shuffleResult = true

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
        const that = this
        let con

        if (this.rootElem.classList.contains('slider')) {
            con = this.rootElem
        } else {
            con = this.rootElem.querySelector('.slider')
        }

        if (!con)
            return

        const cardElem = con.querySelector('.slide[data-name="card"]')
        let lastElem = cardElem

        for (let i=2; i <= this.maxTests; i++) {
            const newElem = cardElem.cloneNode(true)
            newElem.setAttribute('data-name', `card${i}`)
            lastElem.after(newElem)
            lastElem = newElem
        }

        con.querySelectorAll('.slide.card').forEach(elem => {
            this._initCard(elem)
        });

        this.slider = WfUI.Slider(con, {
            onChangeAfter: function() {
                that._refreshTitle()
            }
        })
    }
    get cards() {
        const items = []
        this.rootElem.querySelectorAll('.slide.card').forEach(elem => {
            items.push(elem)
        });
        return items
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
        con = con || card.querySelector('.buttons')
        con.innerHTML = '' // clear
        const utils = window.WfUtils
        const ar = Object.keys(this.buttons || {})
        let skipText = undefined
        for (let i=0; i < ar.length; i++) {
            const id = utils.isNumeric(ar[i]) ? parseInt(ar[i]) : ar[i]
            const text = this.buttons[id]
            if (!id) {
                skipText = text
            } else {
                con.appendChild(this._createButton(text, `.answer|${id}`, id))
            }
        }
        if (skipText)
            con.appendChild(this._createButton(skipText))
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
        const elem = this.rootElem.querySelector('.slide[data-name="intro"] .info')
        if (elem) {
            elem.innerHTML = text
        }
    }
    setIntroStat(text) {
        const elem = this.rootElem.querySelector('.slide[data-name="intro"] .stat')
        if (elem) {
            elem.innerHTML = text
        }
    }
    setSummaryStat(text) {
        const elem = this.rootElem.querySelector('.slide[data-name="summary"] .stat')
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
    incStat(name) {
        const key = `stat_counter_${name}`
        const cur = this.readOption(key, 0)
        this.saveOption(key, cur + 1)
    }
    isOn() {
        return !!this.round
    }
    intro() {
        this._refreshStat()
        if (this.slider) {
            this.slider.first()
        }
    }
    start() {
        if (this.isOn())
            return
        const app = this.app
        app.showProgress()
        this._resetCards()
        this.load(function() {
            this.round = this._newRoundInstance()
            this.round.init()
            this.setRoundsStarted(this.started + 1)
            if (this.slider)
                this.slider.select('card')
            this.render()
            app.hideProgress()
        }, function() {
            app.hideProgress()
        })
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
        this._refreshSummary()

        if (this.slider)
            this.slider.select('summary')

        this.round = undefined
    }
    answer(value, bnElem) {
        if (!this.isOn())
            return

        const that = this
        const utils = window.WfUtils
        const bnId = bnElem ? bnElem.getAttribute('data-id') : ''
        const skip = value === undefined

        if (utils.isNumeric(value)) {
            value = parseInt(value)
        }

        if (skip) {
            this.incStat('skip')
            this.round.acceptSkip()
        } else if (this._validate(value)) {
            this.incStat('pass')
            this._setCardState(GameBase.CARD_STATE.valid, bnId)
            this.round.acceptPassed()
        } else {
            this.incStat('fail')
            this._setCardState(GameBase.CARD_STATE.invalid, bnId)
            this.round.acceptFailed()
        }

        const showNext = that.round.hasTests
        const delay = skip ? 0 : (this.beforeSlideDelay || 0)

        setTimeout(function() {
            if (!showNext) {
                that.finish()
            } else if (that.slider) {
                that.slider.next()
            }
        }, delay)
    }
    skip() {
        this.answer() // call without value
    }
    _validate(value) {
        return false // implement logic in extends
    }
    _createStatLine(text, value) {
        if (typeof value === 'number') {
            value = Math.round(value)
        }
        return '<div class="stat-line">' +
            `<span class="text">${text}</span><span class="num">${value}</span>` +
            '</div>'
    }
    _refreshStat() {
        const utils = WfUtils
        const that = this
        let out = []

        const line = function(text, value) {
            const s = that._createStatLine(text, value)
            out.push(s)
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
    _refreshSummary() {
        const that = this
        const utils = WfUtils
        const sumElem = this.rootElem.querySelector('.slide[data-name="summary"]')
        const r = this.round
        const sec = 0.001 * r.duration
        let grade = 0
        let out = []

        const line = function(text, value) {
            const s = that._createStatLine(text, value)
            out.push(s)
        }

        line('Ответы', `${r.passedTestsCount} / ${r.totalTestsCount}`)
        if (r.passedTestsCount === r.totalTestsCount) {
            const bonus = RoundBase.PRIZE_PER_ROUND
            const cleanScore = r.score - bonus
            line('Очки за ответы', cleanScore)
            line('Бонус', bonus)
            grade = 2
        } else {
            line('Очки за ответы', r.score)
            grade = r.score > 0 ? 1 : 0
        }
        line('Итоговые очки', `+${r.score}`)
        line('Затраченное время', utils.durationToText(sec))

        sumElem.setAttribute('data-grade', grade)

        if (out) {
            this.setSummaryStat(out.join(''))
        } else {
            this.setSummaryStat('')
        }

        // collapse details
        sumElem.querySelectorAll('details').forEach(elem => {
            elem.removeAttribute('open')
        })

        // refresh details
        const logElem = sumElem.querySelector('.results-tab')
        if (logElem) {
            this._refreshLog(logElem)
        }
    }
    _createLogItem(tplId) {
        tplId = tplId || 'tpl-game-log-person'
        const tpl = document.getElementById(tplId)
        if (!tpl)
            throw new Error('invalid log item template id: ' + tplId)
        const div = document.createElement('div')
        div.classList.add('game-log-item-wrapper')
        div.innerHTML = tpl.innerHTML
        return div
    }
    _refreshTitle() {
        const elemTitle = this.rootElem.querySelector('.game-title')
        if (!elemTitle) return
        const slide = this.slider ? this.slider.currentSlide : false
        if (slide && slide.classList.contains('card')) {
            const all = this.cards
            const i = this.cards.indexOf(slide)
            if (i < 0)
                throw new Error('invalid card index')
            elemTitle.innerHTML = `${this.title} (${i+1} / ${all.length})`
        } else {
            elemTitle.innerHTML = this.title
        }
    }
    _getAnswerText(answerId, card) {
        const text = answerId ? this.buttons[answerId] : '--'
        return 'Ответ: ' + text
    }
    onWheel(delta, event) {
        let view
        if (event.target.tagName === 'IMG')
            view = event.target.closest('.face-slot')
        if (event.target.classList.contains('face-slot'))
            view = event.target
        if (!view) return
        const ui = window.WfUI
        const img = view.querySelector('img')
        const tw = ui.ImageTwist(img)
        const pt = [event.offsetX, event.offsetY]
        if (delta > 0) {
            tw.zoomOut(pt)
        } else if (delta < 0) {
            tw.zoomIn(pt)
        }
    }
    onDragging(img, pos) {
        const ui = window.WfUI
        const tw = ui.ImageTwist(img)
        tw.movePos(pos.x, pos.y, true)
        return false // pos already changed
    }
    _getSparqlOptions() {
        return {}
    }
    _getSparqlMethod() {
        throw new Error('not implemented')
    }
    _getSparqlLimit() {
        return this.maxTests
    }
    load(onReady, onError) {
        const that = this
        const wiki = window.WfWiki
        const cards = this.cards
        const superFunc = super.load
        const opt = this._getSparqlOptions()
        const method = this._getSparqlMethod()
        const limit = this._getSparqlLimit()

        wiki[method](limit, opt)
            .then(async result => {
                if (!result || !result.items) {
                    alert('Ошибка при получении данных.')
                    superFunc.call(that, false, onError)
                    return
                }

                const cpad = this.app.getCustomFacePad()
                const list = wiki.collectPeople(result.items, that.shuffleResult)

                if (!list || list.length < limit) {
                    alert('Получено недостаточно данных.')
                    superFunc.call(that, false, onError)
                    return
                }

                for (let i=0; i < cards.length; i++) {
                    const item = list[i]
                    const card = cards[i]
                    const con = card.querySelector('.content')

                    con.innerHTML = '' // clear

                    that._onCardData(card, item, {
                        itemsList: list,
                        cardIndex: i
                    })

                    await that._onCardPhoto(card, item, {
                        container: con,
                        detDisabled: !cpad,
                        pad: cpad,
                        itemsList: list,
                        cardIndex: i
                    })
                }

                superFunc.call(that, onReady)
            })
    }
    _onCardData(card, data, options) {
        options = options || {}
        card.gameData = data // save into the card
    }
    async _onCardPhoto(card, data, options) {
        const ui = window.WfUI
        const img = await ui.addFaceSlot(data.page, options)

        if (img) {
            // ui.bindImageViewer(img)
            img.classList.add('draggable')
        }

        return img
    }
    _refreshLog(con) {
        con.innerHTML = '' // clear

        const that = this
        const wiki = window.WfWiki

        this.cards.forEach(card => {
            const data = card.gameData
            const pers = wiki.Person(data.page)
            const itemElem = that._createLogItem()
            that._initLogItem(card, itemElem, pers)
            con.appendChild(itemElem)
        })
    }
    _initLogItem(card, elem, pers) {
        const data = card.gameData
        const img = elem.querySelector('.person-icon img')
        const imgLink = elem.querySelector('.person-icon a')
        const personName = elem.querySelector('.person-name > span')
        const personLink = elem.querySelector('.person-name > a')
        const personBio = elem.querySelector('.person-bio')
        const answerInfo = elem.querySelector('.answer-info')
        const st = card.getAttribute('data-state')
        const answerId = parseInt(card.getAttribute('data-button') || 0)

        if (st == GameBase.CARD_STATE.valid) {
            elem.classList.add('answer-valid')
        } else if (st == GameBase.CARD_STATE.invalid) {
            elem.classList.add('answer-invalid')
        }

        if (img) img.src = data.photo
        if (imgLink) imgLink.href = data.photo
        if (personBio) personBio.innerHTML = this._getPersonBioHtml(data)
        if (personName) personName.innerText = pers.name
        if (personLink) personLink.href = pers.link
        if (answerInfo) answerInfo.innerText = this._getAnswerText(answerId, card)
    }
    static dateFmt(s) {
        return s ? s.substring(0, 10) : '--'
    }
    static yoFmt(birthDate) {
        const utils = window.WfUtils
        const now = new Date()
        const birth = new Date(birthDate)
        const years = now.getFullYear() - birth.getFullYear()
        const w = utils.yoSuffix(years)
        return `${years} ${w}`
    }
    _getPersonBioHtml(data) {
        const own = this.constructor
        const a = 'Дата рождения: ' + own.dateFmt(data.birthDate)
        const b = data.deathDate ?
            ('Дата смерти: ' + own.dateFmt(data.deathDate)) : own.yoFmt(data.birthDate)
        return `<span class="birth-date">${a}</span>` + `<span class="death-date">${b}</span>`
    }
} // class GameBase

window['GameBase'] = GameBase // register

class GameAliveOrDead extends GameBase {
    constructor(app, desc, options, gameId) {
        gameId = gameId || 'GameAliveOrDead'
        options = options || { maxTests:5 }
        options.buttons = options.buttons || {
            0: 'Дальше ➡️',
            1: '☘️ Жив',
            2: '💀 Мёртв'
        }
        super(app, desc, options, gameId)
        this.ageMin = 25
        this.ageMax = 95
    }
    _validate(value) {
        const card = this.slider.currentSlide
        if (!card.gameData) {
            console.warn('game data not found in current card')
            return false
        }
        const isAlive = !card.gameData.deathDate
        const isDead = !isAlive
        return (value === 1 && isAlive) || (value === 2 && isDead)
    }
    _getSparqlOptions() {
        const opt = super._getSparqlOptions()
        opt.ageMin = this.ageMin
        opt.ageMax = this.ageMax
        return opt
    }
    _getSparqlMethod() {
        return 'sparql_person_live_or_dead'
    }

} // class GameAliveOrDead

window['GameAliveOrDead'] = GameAliveOrDead // register

class GamePredictAge extends GameAliveOrDead {
    constructor(app, desc, options, gameId) {
        gameId = gameId || 'GamePredictAge'
        options = options || { maxTests:5 }
        options.buttons = options.buttons || {
            0: 'Дальше ➡️',
            1: '<30',
            2: '30-45',
            3: '45-60',
            4: '>60',
        }
        super(app, desc, options, gameId)
        this.ageMin = 15
        this.ageMax = 105
    }
    _getSparqlOptions() {
        const opt = super._getSparqlOptions()
        opt.onlyLiving = true
        return opt
    }
    _validate(value) {
        const card = this.slider.currentSlide
        if (!card.gameData) {
            console.warn('game data not found in current card')
            return false
        }
        const now = new Date()
        const birth = new Date(card.gameData.birthDate)
        const years = now.getFullYear() - birth.getFullYear()
        return (value === 1 && years < 30) ||
            (value === 2 && years >= 30 && years <= 45) ||
            (value === 3 && years >= 45 && years <= 60) ||
            (value === 4 && years > 60)
    }
}

window['GamePredictAge'] = GamePredictAge // register

class GamePredictChildren extends GameBase {
    constructor(app, desc, options, gameId) {
        gameId = gameId || 'GamePredictChildren'
        options = options || { maxTests:5 }
        options.buttons = options.buttons || {
            0: 'Дальше ➡️',
            1: 'Нет',
            2: '1',
            3: '2-3',
            4: '>3',
        }
        super(app, desc, options, gameId)
        this.ageMin = 25
        this.ageMax = 95
    }
    _getSparqlMethod() {
        return 'sparql_person_children'
    }
    _getSparqlOptions() {
        const opt = super._getSparqlOptions()
        // opt.onlyWC = true
        // opt.onlyWO = true
        opt.ageMin = this.ageMin
        opt.ageMax = this.ageMax
        return opt
    }
    _validate(value) {
        const card = this.slider.currentSlide
        if (!card.gameData) {
            console.warn('game data not found in current card')
            return false
        }
        const children = parseInt(card.gameData.childCount)
        return (value === 1 && children < 1) ||
            (value === 2 && children === 1) ||
            (value === 3 && children >= 2 && children <= 3) ||
            (value === 4 && children > 3)
    }
    _getPersonBioHtml(data) {
        const a = `Кол-во детей: ${data.childCount}`
        return `<span class="child-count">${a}</span>`
    }
}

window['GamePredictChildren'] = GamePredictChildren // register

class GamePredictOccupation extends GameBase {
    constructor(app, desc, options, gameId) {
        gameId = gameId || 'GamePredictOccupation'
        options = options || { maxTests:5 }
        super(app, desc, options, gameId)
        this.ageMin = 25
        this.ageMax = 105
        this.lastAtrItems = {}
        this.lastAtrLkup = {}
        this.buttonsLkup = {}
    }
    _getSparqlMethod() {
        return 'sparql_person_occupation'
    }
    _getSparqlOptions() {
        const that = this
        const opt = super._getSparqlOptions()
        opt.ageMin = this.ageMin
        opt.ageMax = this.ageMax
        // opt.countriesMax = 15
        opt.occupationMax = 20
        opt.onSelectOccupations = function(items) {
            that.lastAtrItems = items
            that.lastAtrLkup = {}
            items.forEach(x => that.lastAtrLkup[x.code] = x)
        }
        return opt
    }
    _getGameDataAtr(data) {
        return data.occupCode
    }
    _onCardData(card, data, options) {
        super._onCardData(card, data, options)

        const that = this
        const utils = window.WfUtils
        const cardIndex = this.cards.indexOf(card)
        const oc = this._getGameDataAtr(data)
        const presonAtr = this.lastAtrLkup[oc]

        let ar = utils.shuffle(this.lastAtrItems)
                    .filter(x => x.code !== oc)
                    .slice(0, 3)

        ar.push(presonAtr)
        this.buttonsLkup[cardIndex] = {}
        this.buttons = { 0: 'Дальше ➡️' }

        utils.shuffle(ar).forEach(x => {
            const id = Object.keys(that.buttons).length
            that.buttonsLkup[cardIndex][id] = x.code
            that.buttons[id] = x.label
        })

        this._initCardButtons(false, card)
    }
    _validate(value) {
        const card = this.slider.currentSlide
        if (!card.gameData) {
            console.warn('game data not found in current card')
            return false
        }
        const cardIndex = this.cards.indexOf(card)
        const oc = this._getGameDataAtr(card.gameData)
        const bc = this.buttonsLkup[cardIndex][value]
        return oc === bc
    }
    _getPersonBioHtml(data) {
        const oc = this._getGameDataAtr(data)
        const personAtr = this.lastAtrLkup[oc]
        const a = `Профессия: ${personAtr.label}`
        return `<span class="occupation">${a}</span>`
    }
    _getAnswerText(answerId, card) {
        let text = '--'
        if (answerId) {
            const cardIndex = this.cards.indexOf(card)
            const bc = this.buttonsLkup[cardIndex][answerId]
            text = this.lastAtrLkup[bc].label
        }
        return `Ответ: ${text}`
    }
}

window['GamePredictOccupation'] = GamePredictOccupation // register

class GamePredictReligion extends GamePredictOccupation {
    constructor(app, desc, options, gameId) {
        gameId = gameId || 'GamePredictReligion'
        options = options || { maxTests:5 }
        super(app, desc, options, gameId)
    }
    _getSparqlMethod() {
        return 'sparql_person_religion'
    }
    _getSparqlOptions() {
        const that = this
        const opt = super._getSparqlOptions()
        opt.countriesMax = 25
        opt.religionMax = 15
        opt.onSelectReligions = function(items) {
            that.lastAtrItems = items
            that.lastAtrLkup = {}
            items.forEach(x => that.lastAtrLkup[x.code] = x)
        }
        return opt
    }
    _getGameDataAtr(data) {
        return data.religCode
    }
    _getPersonBioHtml(data) {
        const oc = this._getGameDataAtr(data)
        const personAtr = this.lastAtrLkup[oc]
        const a = `Религия: ${personAtr.label}`
        return `<span class="religion">${a}</span>`
    }
}

window['GamePredictReligion'] = GamePredictReligion // register

class GamePredictRelative extends GameBase {
    static SEX_CODES = {
        'Q6581097': 'male',
        'Q6581072': 'female',
    }
    static RELATIVE_STATUS_NAME = {
        ALIEN: 'чужой',
        HUSBAND: 'муж',
        WIFE: 'жена',
        SPOUSE: 'супруг(а)',
        CHILD: 'ребёнок',
        FATHER: 'отец',
        MOTHER: 'мать',
        PARENT: 'родитель',
        COMPETITOR: 'бывш./нов.',
        SPOUSE_PARENT: 'родитель супруга(и)',
        CHILD_SPOUSE: 'невестка/зять',
        GRANDCHILDREN: 'внуки',
        GRANDFATHER: 'дедушка',
        GRANDMOTHER: 'бабушка',
        SIBLING: 'брат/сестра',
        BROTHER: 'брат',
        SISTER: 'сестра',
        SON: 'сын',
        DAUGHTER: 'дочь',
        GRANDSON: 'внук',
        GRANDDAUGHTER: 'внучка',
        SON_IN_LAW: 'зять',
        DAUGHTER_IN_LAW: 'сноха',
        MOTHER_IN_LAW: 'тёща', // +свекровь
        FATHER_IN_LAW: 'тесть', // +свёкр
        BROTHER_IN_LAW: 'деверь',
        SISTER_IN_LAW: 'золовка',
        UNCLE: 'дядя',
        AUNT: 'тётя',
        NEPHEW: 'племянник',
        NIECE: 'племянница',
    }
    constructor(app, desc, options, gameId) {
        gameId = gameId || 'GamePredictRelative'
        options = options || { maxTests:5 }
        options.buttons = options.buttons || {
            0: 'Дальше ➡️',
            1: 'Нет',
            2: 'Родители / Дети',
            3: 'Братья / Сёстры',
            4: 'Супруги',
            // 5: 'Деды / Внуки',
        }
        super(app, desc, options, gameId)
        this.shuffleResult = false
    }
    _getSparqlLimit() {
        return this.maxTests * 2
    }
    _getSparqlMethod() {
        return 'sparql_person_relatives'
    }
    _getSparqlOptions() {
        const opt = super._getSparqlOptions()
        opt.countriesMax = 20
        return opt
    }
    _onCardData(card, data, options) {
        options = options || {}
        const pairIndex = options.cardIndex
        const ia = pairIndex * 2 + 0
        const ib = pairIndex * 2 + 1
        card.gameData = [options.itemsList[ia], options.itemsList[ib]]
    }
    async _onCardPhoto(card, data, options) {
        const ui = window.WfUI
        const ar = card.gameData
        const images = []

        if (!Array.isArray(ar))
            throw new Error('expected game data as array of pair items')

        await ar.forEach(async data => {
            const img = await ui.addFaceSlot(data.page, options)
            if (img) {
                img.classList.add('draggable')
                images.push(img)
            }
        })

        return images
    }
    _refreshLog(con) {
        const that = this
        const wiki = window.WfWiki

        con.innerHTML = '' // clear

        this.cards.forEach(card => {
            const ar = card.gameData
            const pers1 = wiki.Person(ar[0].page)
            const pers2 = wiki.Person(ar[1].page)
            const itemElem = that._createLogItem()
            that._initLogItem(card, itemElem, [pers1, pers2])
            con.appendChild(itemElem)
        })
    }
    _initLogItem(card, elem, arPers) {
        const that = this
        const arData = card.gameData
        const iconFirst = elem.querySelector('.person-icon')
        const personInfoFirst = elem.querySelector('.person-info')
        const iconSecond = iconFirst.cloneNode(true)
        const personInfoSecond = personInfoFirst.cloneNode(true)

        personInfoFirst.after(iconSecond)
        iconSecond.after(personInfoSecond)

        const icons = [iconFirst, iconSecond]
        icons.forEach((iconElem, i) => {
            const data = arData[i]
            const imgElem = iconElem.querySelector('img')
            const linkElem = iconElem.querySelector('a')
            imgElem.src = data.photo
            linkElem.href = data.photo
        })

        const infos = [personInfoFirst, personInfoSecond]
        infos.forEach((infoElem, i) => {
            const data = arData[i]
            const pers = arPers[i]
            const nameElem = infoElem.querySelector('.person-name > span')
            const linkElem = infoElem.querySelector('.person-name > a')
            const personBio = infoElem.querySelector('.person-bio')
            personBio.innerHTML = that._getPersonBioHtml(data, arData[(i+1)%2])
            nameElem.innerText = pers.name
            linkElem.href = pers.link
        })

        const st = card.getAttribute('data-state')
        const answerId = parseInt(card.getAttribute('data-button') || 0)
        const answerInfo = elem.querySelector('.answer-info')

        if (st == GameBase.CARD_STATE.valid) {
            elem.classList.add('answer-valid')
        } else if (st == GameBase.CARD_STATE.invalid) {
            elem.classList.add('answer-invalid')
        }

        if (answerInfo)
            answerInfo.innerText = this._getAnswerText(answerId, card)
    }
    _getPersonBioHtml(data, other) {
        const rsn = GamePredictRelative.RELATIVE_STATUS_NAME
        const sex = GamePredictRelative.SEX_CODES
        let status = '--'

        if (data.baseCode === other.baseCode) { // relative
            const myType = data.type
            const myMale = sex[data.sexCode] === 'male'
            const anType = other.type
            const anMale = sex[other.sexCode] === 'male'

            switch(myType) {
                case 'self': // кто я для...
                    switch(anType) {
                        case 'self': status = rsn.ALIEN; break;
                        case 'spouse': status = myMale ? rsn.HUSBAND : rsn.WIFE; break;
                        case 'mother': status = myMale ? rsn.SON : rsn.DAUGHTER; break;
                        case 'father': status = myMale ? rsn.SON : rsn.DAUGHTER; break;
                        case 'child': status = myMale ? rsn.FATHER : rsn.MOTHER; break;
                        case 'sibling': status = myMale ? rsn.BROTHER : rsn.SISTER; break;
                    }
                    break;

                case 'spouse': // я супруг(а), кто я для...
                    switch(anType) {
                        case 'self': status = myMale ? rsn.HUSBAND : rsn.WIFE; break;
                        case 'spouse': status = rsn.COMPETITOR; break;
                        case 'mother': status = myMale ? rsn.SON_IN_LAW : rsn.DAUGHTER_IN_LAW; break;
                        case 'father': status = myMale ? rsn.SON_IN_LAW : rsn.DAUGHTER_IN_LAW; break;
                        case 'child': status = myMale ? rsn.FATHER : rsn.MOTHER; break;
                        case 'sibling': status = myMale ? rsn.BROTHER_IN_LAW : rsn.SISTER_IN_LAW; break;
                    }
                    break;

                case 'mother': // я мать, кто я для...
                    switch(anType) {
                        case 'self': status = rsn.MOTHER; break;
                        case 'spouse': status = myMale ? 'тёща' : 'свекровь'; break;
                        case 'mother': break;
                        case 'father': status = rsn.HUSBAND; break;
                        case 'child': status = rsn.GRANDMOTHER; break;
                        case 'sibling': status = rsn.MOTHER; break;
                    }
                    break;

                case 'father': // я отец, кто я для...
                    switch(anType) {
                        case 'self': status = rsn.FATHER; break;
                        case 'spouse': status = myMale ? 'тесть' : 'свёкр'; break;
                        case 'mother': status = rsn.WIFE; break;
                        case 'father': break;
                        case 'child': status = rsn.GRANDFATHER; break;
                        case 'sibling': status = rsn.FATHER; break;
                    }
                    break;

                case 'child': // я ребёнок, кто я для...
                    switch(anType) {
                        case 'self': status = myMale ? rsn.SON : rsn.DAUGHTER; break;
                        case 'spouse': status = myMale ? rsn.SON : rsn.DAUGHTER; break;
                        case 'mother': status = myMale ? rsn.GRANDSON : rsn.GRANDDAUGHTER; break;
                        case 'father': status = myMale ? rsn.GRANDSON : rsn.GRANDDAUGHTER; break;
                        case 'child': status = myMale ? rsn.BROTHER : rsn.SISTER; break;
                        case 'sibling': status = myMale ? rsn.NEPHEW : rsn.NIECE; break;
                    }
                    break;

                case 'sibling': // я брат/сестра, кто я для...
                    switch(anType) {
                        case 'self': status = myMale ? rsn.BROTHER : rsn.SISTER; break;
                        case 'spouse': status = myMale ? rsn.BROTHER_IN_LAW : rsn.SISTER_IN_LAW; break;
                        case 'mother': status = myMale ? rsn.SON : rsn.DAUGHTER; break;
                        case 'father': status = myMale ? rsn.SON : rsn.DAUGHTER; break;
                        case 'child': status = myMale ? rsn.UNCLE : rsn.AUNT; break;
                        case 'sibling': status = myMale ? rsn.BROTHER : rsn.SISTER; break;
                    }
                    break;

            }
        } else {
            status = rsn.ALIEN
        }

        const a = `Статус: ${status}`
        return `<span class="relative-status">${a}</span>`
    }
    _validate(value) {
        const card = this.slider.currentSlide
        if (!card.gameData) {
            console.warn('game data not found in current card')
            return false
        }
        const [a, b] = card.gameData
        const isRelative = a.baseCode === b.baseCode

        if (!isRelative) // not relatives
            return (value === 1)

        if (value === 2) // children vs parents
            return (a.type === 'self' && b.type === 'child') ||
                    (a.type === 'self' && b.type === 'mother') ||
                    (a.type === 'self' && b.type === 'father') ||
                    (b.type === 'self' && a.type === 'child') ||
                    (b.type === 'self' && a.type === 'mother') ||
                    (b.type === 'self' && a.type === 'father') ||
                    (a.type === 'sibling' && b.type === 'father') ||
                    (a.type === 'sibling' && b.type === 'mother') ||
                    (b.type === 'sibling' && a.type === 'father') ||
                    (b.type === 'sibling' && a.type === 'mother')

        if (value === 3) // siblings
            return (a.type === 'child' && b.type === 'child') ||
                    (a.type === 'sibling' && b.type === 'sibling') ||
                    (a.type === 'self' && b.type === 'sibling') ||
                    (b.type === 'self' && a.type === 'sibling')

        if (value === 4) // spouse
            return (a.type === 'self' && b.type === 'spouse') ||
                    (b.type === 'self' && a.type === 'spouse') ||
                    (a.type === 'mother' && b.type === 'father') ||
                    (b.type === 'mother' && a.type === 'father')

        if (value === 5) // grands
            return (a.type === 'child' && b.type === 'mother') ||
                    (a.type === 'child' && b.type === 'father') ||
                    (b.type === 'child' && a.type === 'mother') ||
                    (b.type === 'child' && a.type === 'father')

        return false
    }
}

window['GamePredictRelative'] = GamePredictRelative // register