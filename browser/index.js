/*!
 * browser implementation
 * wip
 *
 * @todo 上传快错误处理 增加 retry 以及 maxRetryCount
 * @todo pause 时应 cancel 正在上传的（可以配置是否有该行为）
 * @todo 支持 Worker
 *
 * 支持 pause 和 resume 的话可能需要 Task 以及 TaskRunner
 */

;

(function () {
  // 上传文件 api
  function uploadFile (data) {
    return fetch('http://localhost:10240/upload', {
      method: 'POST',
      body: data
    })
  }

  // 通知服务端现在上传完毕了，可以合并了
  function notifyUploadEnd (fileName) {
    return fetch('http://localhost:10240/concat-caches?fileName=' + fileName, {
      method: 'GET'
    })
  }

  var /*chunkStateMap = */stateMap = { INITIAL: 0, UPLOADING: 1, SUCCESS: 2, ERROR: 3 }
  var taskStateMap = { ERROR: -1, INITIAL: 0, SLICING: 1, SLICED: 2, UPLOADING: 3, UPLOADED: 4, NOTIFIED: 5 }

  function Task (file, options) {
    if (!(this instanceof Task)) {
      throw new Error('Use new Task(config).')
    }

    var defaultOptions = {
      chunkSize: 100 * 1024,    // 100KB
      maxConcurrencyNumber: 2,  // Infinity,
      overrideFileName: '',
      needMd5sum: false,        // true,
      uploadApi: null,
      notifyApi: null
    }
    this.options = Object.assign({ }, defaultOptions, options)
    this.file = file

    this.state = taskStateMap.INITIAL
    this.chunks = [ ]

    this.pausing = false

    const chunkLength = Math.ceil(file.size / this.options.chunkSize)
    this.fullChunkState = Object.keys(
      (new Array(chunkLength)).join(',').split(',')
    ).reduce((acc, x) => {
        acc[x] = stateMap.INITIAL
        return acc
    }, { })
  }

  Task.prototype = {
    constructor: Task,

    _sliceFile: function () {
      var task = this

      task.state = taskStateMap.SLICING

      var fileSize = task.file.size
      if (fileSize === 0) {
        task.state = taskStateMap.ERROR
        return Promise.reject(new Error('No file'))
      }

      var chunks$ = [ ]

      // 记录当前的起始位置，以及总共的块数
      var startPosition = 0
      var count = 0

      // 循环切分
      while (true) {
        var endPosition = startPosition + task.options.chunkSize

        // 调整最后的终止位置
        var isLastChunk = endPosition >= fileSize
        if (isLastChunk) {
          endPosition = fileSize
        }

        var blob = task.file.slice(startPosition, endPosition)

        var chunk$ = task._getMd5sum(blob).then(
          // 注意 closure
          (function (blob, chunkIndex) {
            return function (md5sum) {
              return { blob: blob, chunkIndex: chunkIndex, md5sum: md5sum, fileName: task.file.name }
            }
          })(blob, count),
          function (err) {
            throw err
          }
        )

        chunks$.push(chunk$)

        count += 1
        startPosition += task.options.chunkSize

        // 出去的条件
        if (isLastChunk) {
          break
        }
      }
      return Promise.all(chunks$).then(function (chunks) {
        task.state = taskStateMap.SLICED
        task.chunks = chunks

        return chunks
      }, function (err) {
        task.state = taskStateMap.ERROR
        throw err
      })
    },
    // 使用 SparkMD5 来获取 md5 值，但是包装成基于 Promise 的
    _getMd5sum (file) {
      return !this.options.needMd5sum
        ? Promise.resolve('')
        : new Promise(function (resolve, reject) {
            var reader = new FileReader()
            reader.onerror = function (err) {
            reject(err)
          }
          reader.onload = function (e) {
            var md5sum = SparkMD5.hashBinary(e.target.result)
            resolve(md5sum)
          }
          reader.readAsBinaryString(file)
        })
    },
    // 单个块上传
    _uploadChunk (chunk, type) {
      var fd = new FormData()
      Object.keys(chunk).forEach((prop) => {
        fd.append(prop, chunk[prop])
      })
      return this.options.uploadApi(fd)
    },
    upload () {
      this.pausing = false
      // 先不考虑 slicing 状态
      let promise = null
      if (this.state === taskStateMap.INITIAL) {
        promise = this._sliceFile()
      } else {
        promise = Promise.resolve(this.chunks)
      }

      var task = this
      return promise.then(function (chunks) {
        return task._uploadChunks(chunks)
      })
    },
    // 批量上传多个块
    _uploadChunks(chunks) {
      var task = this

      task.state = taskStateMap.UPLOADING

      // util - 获取当前未上传块
      const randomGetNonUploadChunkIndex = function () {
        if (task.pausing) {
          return null
        }

        let index = null

        Object.keys(task.fullChunkState).some((prop) => {
          if (task.fullChunkState[prop] === 0) {
            index = Number(prop)

            return true
          }
        })

        return index
      }

      var next = function (chunk) {
        task.fullChunkState[chunk.chunkIndex] = stateMap.UPLOADING
        return task._uploadChunk(chunk).then(function (res) {
          task.fullChunkState[chunk.chunkIndex] = stateMap.SUCCESS

          var nextIndex = randomGetNonUploadChunkIndex()

          console.log(chunk.chunkIndex, nextIndex)

          if (nextIndex !== null) {
            return next(chunks[nextIndex])
          }
        })
      }

      // 获取当前还为上传的块
      var initialChunks = [ ]
      chunks.forEach(function (chunk) {
        if (task.fullChunkState[chunk.chunkIndex] === stateMap.INITIAL) {
          initialChunks.push(chunk)
        }
      })

      var initialUploadQueue = initialChunks.slice(0, task.options.maxConcurrencyNumber).map(function (chunk) {
        return next(chunk)
      })

      return Promise.all(initialUploadQueue).then(function () {
        const notAllUpload = Object.keys(task.fullChunkState).some(key => {
          if (task.fullChunkState[key] !== stateMap.SUCCESS) {
            return true
          }
        })
        if (!notAllUpload) {
          task.state = taskStateMap.UPLOADED
          return task.options.notifyApi(chunks[0].fileName).then(function () {
            task.state = taskStateMap.NOTIFIED
          }, function (err) {
            task.state = taskStateMap.ERROR
            throw err
          })
        }
        
        return Promise.reject('Not uploaded all')
      })
    },
    pause () {
      this.pausing = true
    }
  }

  window.onload = function () {
    var fileInput = document.querySelector('#file')
    var pauseBtn = document.querySelector('#pause')

    var file = null
    var task = null

    fileInput.addEventListener('change', function (evt) {
      file = evt.target.files[0]
      task = new Task(file, { uploadApi: uploadFile, notifyApi: notifyUploadEnd })
      evt.target.value = null
    })

    pauseBtn.addEventListener('click', function (evt) {
      if (!file) {
        alert('请选择文件')
        return
      }
      var btnValue = pauseBtn.value
      if (btnValue === 'up') {
        pauseBtn.value = 'pause'
        pauseBtn.innerHTML = '暂停'
        task.upload()
      } else if (btnValue === 'pause') {
        pauseBtn.value = 'up'
        pauseBtn.innerHTML = '继续上传'
        task.pause()
      }
    })
  }
})()
