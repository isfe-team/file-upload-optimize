/*!
 * A simple `TaskRunner` implementation test | bqliu
 *
 * use delay test
 */

;

(function () {
  var CancelMessage = function (message) {
    this.message = message
  }
  CancelMessage.prototype.__CANCEL__ = true

  var delay = function (ms) {
    let timer = null
    let cancel = null
    var promise = new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        console.log('task: delay', ms, 'executed')
        resolve(ms)
      }, ms)

      cancel = reject
    })

    promise.__timer = timer
    promise.__cancel = function (message) {
      cancel(new CancelMessage(message))
    }

    return promise
  }

  var cancelDelay = function (delayPromise) {
    clearTimeout(delayPromise.__timer)
    delayPromise.__cancel('haha, cancel')
  }

  var isCancel = function (err) {
    return !!(err && err.__CANCEL__)
  }

  var delayTaskGenerator = function (ms) {
    return delay(ms)
  }

  var delayTaskConfigs = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ].map(function (s) {
    return s * 1000
  })

  var $echo = document.querySelector('#echo')

  var echo = function (str) {
    var $text = document.createElement('div')
    $text.innerText = str
    $echo.appendChild($text)
  }

  var tr = window.tr = new TaskRunner({
    taskConfigs: delayTaskConfigs,
    taskGenerator: delayTaskGenerator,
    cancelTask: cancelDelay,
    cancelWhenPause: true, // false
    isCancel: isCancel,
    maxConcurrencyNumber: 4,
    onTaskSuccess: function () { echo('task success' + JSON.stringify(arguments)) },
    onTaskError: function () { echo('task error' + JSON.stringify(arguments)) },
    onAllTaskSuccess: function () { echo('task all success' + JSON.stringify(arguments)) }
  })

  tr.start()
})()
