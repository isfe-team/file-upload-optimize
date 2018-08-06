/*!
 * browser implementation
 * wip
 *
 * @todo 上传快错误处理 增加 retry 以及 maxRetryCount
 * @todo 增加 pause 和 resume
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

  function Task (file, options) {
    if (!(this instanceof Task)) {
      throw new Error('Use new Task(config).')
    }

    var defaultOptions = {
      chunkSize: 100 * 1024,    // 100KB
      maxConcurrencyNumber: 4,  // Infinity,
      overrideFileName: '',
      needMd5sum: true,
      uploadApi: null,
      notifyApi: null
    }

    this.options = Object.assign({ }, defaultOptions, options)
    this.file = file
  }

  Task.prototype = {
    constructor: Task,

    sliceFile: function () {
      var task = this

      var fileSize = task.file.size
      if (fileSize === 0) {
        return Promise.reject(new Error('No file'))
      }

      var chunks = [ ]

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

        var chunk = task.getMd5sum(blob).then(
          // 注意 closure
          (function (chunkIndex) {
            return function (md5sum) {
              return { blob: blob, chunkIndex: chunkIndex, md5sum: md5sum, fileName: task.file.name }
            }
          })(count),
          function (err) { throw err }
        )

        chunks.push(chunk)

        count += 1
        startPosition += task.options.chunkSize

        // 出去的条件
        if (isLastChunk) {
          break
        }
      }
      return Promise.all(chunks)
    },
    // 使用 SparkMD5 来获取 md5 值，但是包装成基于 Promise 的
    getMd5sum (file) {
      return new Promise(function (resolve, reject) {
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
    uploadChunk (chunk, type) {
      var fd = new FormData()
      Object.keys(chunk).forEach((prop) => {
        fd.append(prop, chunk[prop])
      })
      return this.options.uploadApi(fd)
    },
    // 批量上传多个块
    uploadChunks(chunks) {
      var task = this

      var stateMap = { INITIAL: 0, UPLOADING: 1, SUCCESS: 2, ERROR: 3 }

      var fullChunkState = Object.keys(
        (new Array(chunks.length)).join(',').split(',')
      ).reduce((acc, x) => {
          acc[x] = stateMap.INITIAL
          return acc
      }, { })

      // util - 获取当前未上传块
      const randomGetNonUploadChunkIndex = function () {
        let index = null

        Object.keys(fullChunkState).some((prop) => {
          if (fullChunkState[prop] === 0) {
            index = Number(prop)

            return true
          }
        })

        return index
      }

      var next = function (chunk) {
        fullChunkState[chunk.chunkIndex] = stateMap.UPLOADING
        return task.uploadChunk(chunk).then(function () {
          fullChunkState[chunk.chunkIndex] = stateMap.SUCCESS

          var nextIndex = randomGetNonUploadChunkIndex()

          console.log(chunk.chunkIndex, nextIndex)

          if (nextIndex !== null) {
            return next(chunks[nextIndex])
          }
        })
      }

      var initialUploadQueue = chunks.slice(0, task.options.maxConcurrencyNumber).map(function (chunk) {
        return next(chunk)
      })

      Promise.all(initialUploadQueue).then(function () {
        task.options.notifyApi(chunks[0].fileName)
      })
    }
  }

  window.onload = function () {
    var fileInput = document.querySelector('#file')

    fileInput.addEventListener('change', function (evt) {
      var file = evt.target.files[0]

      var task = new Task(file, { uploadApi: uploadFile, notifyApi: notifyUploadEnd })

      evt.target.value = null

      task.sliceFile().then(function (chunks) {
        var chunkLength = chunks.length
        chunks.forEach(function (chunk) {
          chunk.chunkLength = chunkLength
        })

        console.log(chunks)

        return task.uploadChunks(chunks)
      })
    })
  }
})()
