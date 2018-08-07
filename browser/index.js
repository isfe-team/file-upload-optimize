/*!
 * browser implementation
 * wip
 */

;

(function () {
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

  class Task {
    constructor (file, chunkSize, cutNum) {
      this.file = file;
      this.chunkSize = chunkSize;
      this.cutNum = cutNum;
    }
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

        const task$ = this.getMd5sum(blob).then(
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
    }
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
    }
    uploadChunk (chunk) {
      const fd = new FormData()
      Object.keys(chunk).forEach((prop) => {
        fd.append(prop, chunk[prop])
      })
      return uploadFile(fd)
    }
    uploadChunks() {
      const $this = this;
      this.cutfile(this.file, this.chunkSize).then(function (chunks) {
        const chunkLength = chunks.length
        chunks.forEach(function (chunk) {
          chunk.chunkLength = chunkLength
        })
        if (!$this.cutNum) {
          $this.cutNum = chunkLength;
        }

        const fullChunkState = Object.keys((new Array(chunkLength)).join(',').split(',')).reduce((acc, x) => {
          acc[x] = 0
          return acc
        }, { })

        // util - 获取当前未上传块
        const randomGetNonUploadChunk = function () {
          let ret = null

          Object.keys(fullChunkState).some((prop) => {
            if (fullChunkState[prop] === 0) {
              ret = Number(prop)

              return true
            }
          })

          return ret
        }

        const next = function (chunk) {
          fullChunkState[chunk.chunkIndex] = 1
          return $this.uploadChunk(chunk).then(res => {
            fullChunkState[chunk.chunkIndex] = 2

            const nextIndex = randomGetNonUploadChunk()

            console.log(chunk.chunkIndex, nextIndex)

            if (nextIndex !== null) {
              return next(chunks[nextIndex])
            }

            // if ($this.cutNum + chunk.chunkIndex < chunk.chunkLength) {
            //   return next(chunks[$this.cutNum + chunk.chunkIndex]);
            // }
          })
        }
        // console.log(chunks.length)
        return Promise.all(chunks.slice(0, $this.cutNum).map(function (chunk) {
          return next(chunk);
        })).then(function (values) {
          // console.log('values', values)
          notifyUploadEnd(chunks[0].fileName)
        })
      })
    }
  }

  window.onload = function () {

    const fileInput = document.querySelector('#file');

    fileInput.addEventListener('change', function (evt) {
      const file = evt.target.files[0];
      // task.cutfile(file, 100 * 1024).then(function (chunks) {
      //   const chunkLength = chunks.length
      //   chunks.forEach(function (chunk) {
      //     chunk.chunkLength = chunkLength
      //   })

      //   console.log(chunks)

      //   return task.uploadChunks(chunks, 4)
      // })
      const task = new Task(file, 100 * 1024, 4);
      task.uploadChunks();
    })
  }
})()
