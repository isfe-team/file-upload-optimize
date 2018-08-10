/*!
 * browser implementation
 * wip
 */

;

(function () {
  var chunkStateMap = { INITIAL: 0, UPLOADING: 1, SUCCESS: 2, ERROR: 3 }
  var taskStateMap = { ERROR: -1, INITIAL: 0, SLICING: 1, SLICED: 2, UPLOADING: 3, UPLOADED: 4, NOTIFIED: 5 }

  var CancelToken = axios.CancelToken

  var axiosInstance = axios.create({
    baseURL: 'http://localhost:10240'
  })

  function cancelableXhrFactory (method, url, data) {
    var cancel
    var req = axiosInstance[method](url, data, {
      cancelToken: new CancelToken(function (c) {
        cancel = c
      })
    })

    req.__cancel = cancel

    return req
  }

  // 上传文件 api
  function uploadFile (data) {
    return cancelableXhrFactory('post', 'upload', data)
  }

  // 通知服务端现在上传完毕了，可以合并了
  function notifyUploadEnd (fileName) {
    return cancelableXhrFactory('get', 'concat-caches?fileName=' + fileName)
  }

  window.onload = function () {
    var fileInput = document.querySelector('#file')
    var pauseBtn = document.querySelector('#pause')

    var file = null
    var fileUploader = null

    fileInput.addEventListener('change', function (evt) {
      file = evt.target.files[0]
      fileUploader = new FileUploader(file, {
        uploadApi: uploadFile,
        notifyApi: notifyUploadEnd,
        isCancel: axios.isCancel,
        cancelWhenPause: false,
        cancelApi: function (promise) {
          promise.__cancel()
        },
        onMessage: function (message) {
          console.log('GET MESSAGE:', message.type, message.payload)

          if (message.type === 'FILE_UPLOAD_SUCCESS') {
            pauseBtn.value = 'upload'
            pauseBtn.innerText = '上传'
          }
        }
      })
      evt.target.value = null
    })

    var sliced = false
    pauseBtn.addEventListener('click', function (evt) {
      if (!file) {
        alert('请选择文件')
        return
      }
      var btnValue = pauseBtn.value
      if (btnValue === 'upload') {
        pauseBtn.value = 'pause'
        pauseBtn.innerText = '暂停'
        if (sliced) {
          fileUploader.upload()
          return
        }
        fileUploader.sliceFile().then(function () {
          sliced = true
          return fileUploader.upload()
          pauseBtn.value = 'upload'
          pauseBtn.innerText = '上传'
        })
      } else if (btnValue === 'pause') {
        pauseBtn.value = 'upload'
        pauseBtn.innerText = '继续上传'
        fileUploader.pause()
      }
    })
  }
})()
