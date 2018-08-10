/*!
 * A simple `TaskRunner` implementation | bqliu
 *
 * support Promise-based task
 *
 * @todo support retryCount
 * @todo discuss how to handle ERROR state when excuting task
 * @todo discuss add `TaskRunner` state control, now only pausing
 */

;

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? module.exports = factory()
    : typeof define === 'function' && define.amd
      ? define(factory)
      : (global.TaskRunner = factory())
})(this, function () {

  // utils
  function noop () { }

  var getUid = (function () {
    var cid = 0
    return function () {
      return cid += 1
    }
  })()

  // state of a task in TaskRunner
  var taskStateMap = { ERROR: -1, INITIAL: 0, PROCESSING: 1, SUCCESS: 2 }

  // taskConfigs tasks TaskRunner
  // taskConfigs | taskGenerator
  // cancelTask | maxConcurrencyNumber | cancelWhenPause
  // onTaskSuccess | onTaskError | onAllTaskSuccess
  function TaskRunner (options) {
    if (!(this instanceof TaskRunner)) {
      throw new Error('use new TaskRunner(options)')
    }

    // options check
    if (!options || !options.taskGenerator) {
      throw new Error('options error')
    }

    // cache raw
    this._options = options

    // if exist, use it
    // otherwise, use empty array at first
    var taskConfigs = Array.isArray(options.taskConfigs)
                    ? options.taskConfigs
                    : [ ]

    this.setTaskConfigs(taskConfigs)

    // a function that accept a config, and return a Promise-based task
    this.taskGenerator = options.taskGenerator

    // whether a task can be canceled
    this.cancelable = !!options.cancelTask
    this.cancelTask = options.cancelTask
    this.cancelWhenPause = !!options.cancelWhenPause
    this.isCancel = options.isCancel

    // the task excuting state, pausing or not
    this.pausing = false

    // not parallel and depends on platform/env
    this.maxConcurrencyNumber = options.maxConcurrencyNumber || 4

    // some user defined handlers
    this.handlers = {
      onTaskSuccess: options.onTaskSuccess || noop,
      onTaskError: options.onTaskError || noop,
      onAllTaskSuccess: options.onAllTaskSuccess || noop
    }

    // inner excuting tasks, `this.tasks.maxLength <= this.maxConcurrencyNumber`
    this.tasks = [ ]
  }

  TaskRunner.prototype = {
    constructor: TaskRunner,

    // @public
    // set taskConfigs, because sometimes we don't know when we can get exact configs
    // but other params should be set at first
    setTaskConfigs: function (taskConfigs) {
      // the configs of tasks, used in `taskGenerator` and generate a Promise-based task
      this.taskConfigs = taskConfigs.map(function (config) {
        return {
          uid: getUid(),
          state: taskStateMap.INITIAL,
          core: config
        }
      })

      // used for backup and save many things
      this.taskConfigsBak = this.taskConfigs.slice(0)
    },

    // @private
    // get an undo task config to generate next task
    _getUndoTaskConfig: function () {
      return this.taskConfigs.find(function (taskConfig) {
        return taskConfig.state === taskStateMap.INITIAL || taskConfig.state === taskStateMap.ERROR
        // return taskConfig.state !== taskStateMap.SUCCESS
      })
    },

    // @private
    // remove a task in tasks, used when success/error
    _removeTask: function (task) {
      var index = this.tasks.findIndex(function (x) {
        return x === task
      })
      if (index === -1) {
        throw new Error('impossible, must exist')
      }
      this.tasks.splice(index, 1)
    },

    // @private
    // remove a config in taskConfigs, used when success/error
    _removeTaskConfig: function (config) {
      var index = this.taskConfigs.findIndex(function (x) {
        return x === config
      })
      if (index === -1) {
        throw new Error('impossible, must exist')
      }
      this.taskConfigs.splice(index, 1)
    },

    // @private
    // generate a task and push it into `this.tasks`
    _addTask: function () {
      var me = this

      if (me.pausing) {
        return false
      }

      var certainUndoTaskConfig = me._getUndoTaskConfig()

      // No undo task left
      if (!certainUndoTaskConfig) {
        return false
      }
      // if has, push into the task queue
      var task$ = me.taskGenerator(certainUndoTaskConfig.core)
      var task = {
        t$: task$,
        // config is a ref of certainUndoTaskConfig in taskConfigs/taskConfigsBak
        config: certainUndoTaskConfig
      }

      certainUndoTaskConfig.state = taskStateMap.PROCESSING

      // Notice the diff between t$ & task$
      task$.then(function (res) {
        me._handleTaskSuccess(task, res)
      }, function (err) {
        me.handlers.onTaskError(err)
        task.config.state = taskStateMap.ERROR
        task.config.res = err

        me._removeTask(task)
        // when cancel, if `cancelable && isCancel(err)`, don't remove
        // otherwise, maybe remove config is better.
        // now, I don't remove it, and set the ERROR state,
        // so if `_addTask`, this task can be re-excuted.
        // hmmm, retryCount is necessary.
        // if (!(me.cancelable && me.isCancel(err))) {
          // me._removeTaskConfig(task.config)
        // }

        throw err
      })

      this.tasks.push(task)

      return true
    },

    // @private
    // inner `onTaskSuccess` handler
    _handleTaskSuccess: function (task, res) {
      this._removeTask(task)
      this._removeTaskConfig(task.config)

      task.config.state = taskStateMap.SUCCESS
      task.config.res = res

      this.handlers.onTaskSuccess(task, res)

      // Notice the condition -- every
      var allExecuted = this.taskConfigsBak.every(function (taskConfig) {
        return taskConfig.state === taskStateMap.SUCCESS
      })

      // if all executed success, just invoke `onAllTaskSuccess`
      if (allExecuted) {
        var results = this.taskConfigsBak.map(function (config) {
          return config.res
        })
        this.handlers.onAllTaskSuccess(results)
        return
      }

      // else, just add next task
      this._addTask()
    },

    // @public
    // boomm
    start: function () {
      this.pausing = false

      // bootstrap
      // just add some tasks, and in `_addTask`,
      // task was generated, and once generated, the task will run automatically
      while (this.tasks.length < this.maxConcurrencyNumber) {
        var certainUndoTaskConfig = this._getUndoTaskConfig()

        var hasLeftUndoTask = this._addTask()

        if (!hasLeftUndoTask) {
          break
        }
      }
    },

    // @public
    // oh oh pause me
    pause: function () {
      var me = this

      me.pausing = true

      // if can't cancel, return directly
      if (!me.cancelable) {
        return
      }

      // if cancelable but `cancelWhenPause` is false
      if (!me.cancelWhenPause) {
        return
      }

      // else, cancel task
      me.tasks.forEach(function (task) {
        me.cancelTask(task.t$)
      })
    }
  }

  return TaskRunner
})
