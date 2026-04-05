/* effects code */

window['doCongratsEffect'] = function() {
    console.log('congrats effect...')
    confetti({
        particleCount: 100,
        spread: 70,
        angle: 45,
        decay: 0.92,
        ticks: 250,
        origin: { x: -0.05, y: 0.5 }
    })
    confetti({
        particleCount: 100,
        spread: 70,
        angle: 135,
        decay: 0.92,
        ticks: 250,
        origin: { x: 1.05, y: 0.5 }
    })
}

document.addEventListener('game-intro', function(event) {
    // console.warn('game-into', event)
})

document.addEventListener('game-finish', function(event) {
    if (!event.detail) return
    const game = event.detail
    const grade = game.getRoundGrade()
    if (grade !== GameBase.GRADES.BRILLIANT) return
    setTimeout(function() {
        window.doCongratsEffect()
    }, 1500)
})
