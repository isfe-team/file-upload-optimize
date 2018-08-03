/*!
 * browser implementation
 * wip
 */
 window.onload = function () {
  // 未处理后续动作，待完善
  function uploadFile (data) {
    return fetch('http://localhost:10240/upload', {
      method: 'POST',
      body: data
    })
  }

  function notifyUploadEnd (fileName) {
    return fetch('http://localhost:10240/concat-caches?fileName=' + fileName, {
      method: 'GET'
    })
  }

  // 处理函数
  const task = {
    // 切割文件
    cutfile (file, chunkSize) {
      // 向上取整
      const fileSize = file.size
      if (fileSize === 0) {
        return Promise.reject(new Error('No file'))
      }

      const tasks$ = [ ]
      let startPosition = 0
      let count = 0

      while (true) {
        let endPosition = startPosition + chunkSize

        const isLastChunk = endPosition >= fileSize
        if (isLastChunk) {
          endPosition = fileSize
        }

        const blob = file.slice(startPosition, endPosition)

        const task$ = task.getMd5sum(blob).then(
          (function (chunkIndex) {
            return function (md5sum) {
              return { blob: blob, chunkIndex: chunkIndex, md5sum: md5sum, fileName: file.name }
            }
          })(count),
          function () { console.log() }
        )

        tasks$.push(task$)

        count += 1
        startPosition += chunkSize

        if (isLastChunk) {
          break
        }
      }
      return Promise.all(tasks$)
    },
    getMd5sum (file) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader()
        reader.onerror = function (err) {
          reject(err)
        }
        reader.onload = function (e) {
          const md5sum = SparkMD5.hashBinary(e.target.result)
          resolve(md5sum)
        }
        reader.readAsBinaryString(file)
      })
    },
    // 单个文件上传请求
    uploadChunk (chunk, type) {
      const fd = new FormData()
      Object.keys(chunk).forEach((prop) => {
        fd.append(prop, chunk[prop])
      })
      return uploadFile(fd)
    },
    uploadChunks(chunks, type) {
      // 先只是并发传
      return Promise.all(chunks.map(function (chunk) {
        return task.uploadChunk(chunk)
      })).then(function () {
        notifyUploadEnd(chunks[0].fileName)
      })
    }
  }

  const fileInput = document.querySelector('#file')

  fileInput.addEventListener('change', function (evt) {
    const file = evt.target.files[0];
    task.cutfile(file, 100 * 1024).then(function (chunks) {
      const chunkLength = chunks.length
      chunks.forEach(function (chunk) {
        chunk.chunkLength = chunkLength
      })

      console.log(chunks)

      return task.uploadChunks(chunks)
    })
  })
 }

