/*!
 * FileUploader browser implementation
 * wip
 *
 * slice file to multiple chunks
 * and use TaskRunner to manage the process of upload.
 *
 * Note that the followed es-version is 5,
 * yet maybe some ES next api will be used for convenience.
 *
 * Note now no module loader, load `TaskRunner.js` before load this lib.
 *
 * Note that we should use like this:
 *   `fileUploader.sliceFile().then(function () { fileUploader.upload() })`
 *
 * @todo support Worker
 */

;

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? module.exports = factory()
    : typeof define === 'function' && define.amd
      ? define(factory)
      : (global.FileUploader = factory())
})(this, function () {

  function FileUploader (file, options) {
    if (!(this instanceof FileUploader)) {
      throw new Error('Use new FileUploader(file, options).')
    }

    var defaultOptions = {
      chunkSize: 100 * 1024,    // 100KB
      maxConcurrencyNumber: 4,  // Infinity,
      overrideFileName: '',     // now as a placeholder, no usage now
      needMd5sum: false,        // true
      uploadApi: null,
      notifyApi: null,
      cancelApi: null,
      isCancel: null,
      cancelWhenPause: false,
      onMessage: function () { }
    }

    if (!options.uploadApi || !options.notifyApi) {
      throw new Error('uploadApi and notifyApi must exist')
    }

    this.options = Object.assign({ }, defaultOptions, options)
    this.file = file

    // in face, we may need to record various state.
    // but it's hard to handle error state consider of interaction.
    // this.state = { error | initial | slicing | sliced | uploading | uploaded }

    // of course, we may need to record error
    // this.error = null

    // create TaskRunner, but reset the taskConfigs later
    this.taskRunner = new TaskRunner({
      taskConfigs: [ ],
      taskGenerator: (function (chunk) {
        var fd = new FormData()
        Object.keys(chunk).forEach(function (prop) {
          fd.append(prop, chunk[prop])
        })
        return this.options.uploadApi(fd)
      }).bind(this),
      cancelTask: this.options.cancelApi,
      isCancel: this.options.isCancel,
      cancelWhenPause: this.options.cancelWhenPause,
      maxConcurrencyNumber: this.options.maxConcurrencyNumber,
      onTaskSuccess: this._onTaskSuccess.bind(this),
      onTaskError: this._onTaskError.bind(this),
      onAllTaskSuccess: this._onAllTaskSuccess.bind(this)
    })

    this.chunks = [ ]
  }

  FileUploader.prototype = {
    constructor: FileUploader,

    // @private
    // notify user some breaking message
    _emit: function (type, payload) {
      this.options.onMessage({
        type: type,
        payload: payload
      })
    },

    // @private
    // handle various message from taskRunner
    _onTaskSuccess: function (payload) {
      this._emit('CHUNK_UPLOAD_SUCCESS', payload)
    },

    _onTaskError: function (payload) {
      this._emit('CHUNK_UPLOAD_ERROR', payload)
    },

    _onAllTaskSuccess: function (payload) {
      this._emit('FILE_UPLOAD_SUCCESS', payload)

      var exactName = this.options.overrideFileName
                      ? this.options.overrideFileName
                      : this.chunks.length > 0
                        ? this.chunks[0].fileName
                        : ''

      var uploader = this

      this.options.notifyApi(exactName).then(function (res) {
        uploader._emit('NOTIFY_SUCCESS', res)
      }, function (err) {
        uploader._emit('NOTIFY_ERROR', err)
      })
    },

    // @public
    // slice file and generate chunks.
    // it's not very good 
    sliceFile: function () {
      var uploader = this

      var fileSize = uploader.file.size
      if (fileSize === 0) {
        return Promise.reject({
          type: 'SLICE_ERROR_NO_FILE',
          payload: uploader.file
        })
      }

      var chunks$ = [ ]

      // 记录当前的起始位置，以及总共的块数
      var startPosition = 0
      var count = 0

      // 循环切分
      while (true) {
        var endPosition = startPosition + uploader.options.chunkSize

        // 调整最后的终止位置
        var isLastChunk = endPosition >= fileSize
        if (isLastChunk) {
          endPosition = fileSize
        }

        var blob = uploader.file.slice(startPosition, endPosition)

        var chunk$ = uploader._getMd5sum(blob).then(
          // 注意 closure
          (function (blob, chunkIndex) {
            return function (md5sum) {
              return { blob: blob, chunkIndex: chunkIndex, md5sum: md5sum, fileName: uploader.file.name }
            }
          })(blob, count),
          function (err) {
            return Promise.reject({
              type: 'CALC_MD5_ERROR',
              payload: err
            })
          }
        )

        chunks$.push(chunk$)

        count += 1
        startPosition += uploader.options.chunkSize

        // 出去的条件
        if (isLastChunk) {
          break
        }
      }
      return Promise.all(chunks$).then(function (chunks) {
        uploader.chunks = chunks

        console.log('chunks', chunks)

        uploader.taskRunner.setTaskConfigs(chunks)

        return chunks
      }, function (err) {
        return Promise.reject({
          type: 'CALC_MD5_ERROR',
          payload: err
        })
      })
    },

    // @private
    // use SparkMD5 to get md5sum, but wrap it with Promise
    _getMd5sum: function (blob) {
      // if don't need md5sum, resolve the value `''`
      return !this.options.needMd5sum
        ? Promise.resolve('')
        : new Promise(function (resolve, reject) {
            var reader = new FileReader()
            reader.onerror = function (err) {
            reject({
              type: 'CALC_MD5_ERROR',
              payload: err
            })
          }
          reader.onload = function (e) {
            var md5sum = SparkMD5.hashBinary(e.target.result)
            resolve(md5sum)
          }
          reader.readAsBinaryString(blob)
        })
    },

    // @public
    // start to upload, used to upload or resume
    // must used after `sliceFile`
    upload: function () {
      this.taskRunner.start()
    },

    // @public
    // pause
    pause: function () {
      this.taskRunner.pause()
    }
  }

  return FileUploader
})
