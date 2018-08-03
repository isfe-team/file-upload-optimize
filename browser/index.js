/*!
 * browser implementation
 * wip
 */
 window.onload = function () {
  // 封装post请求
  function uploadFile (url, data, success, error) {
    var xhr = new XMLHttpRequest();
    xhr.open('post', url);
    xhr.send(data);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && xhr.status === 200) {
        console.log('上传成功');
        success(xhr.responseText);
      } else {
        console.log('上传失败');
        error()
      }
    }
  }
  // 处理函数
  const task = {
    // 切割文件
    cutfile (file, chunkSize) {
      let count = parseInt(file.size / chunkSize, 10);
      let chunks = [ ];
      for (let i = 0; i <= count; i++) {
        const fileBlob = i === count ? file.slice(chunkSize * count, file.size) : file.slice(chunkSize * i, chunkSize * (i + 1));
        task.getMd5(fileBlob, function (err, md5sum) {
          chunks.push({
            blob: fileBlob,
            index: i,
            blobSize: fileBlob.size,
            fileName: file.fileName,
            totalCount: count + 1,
            md5: md5sum
          })
        })
      }
      return chunks;
    },
    getMd5 (file, callback) {
      const reader = new FileReader();
      reader.onerror = function (e) {
        callback(e)
      }
      reader.onload = function (e) {
        const md5sum = SparkMD5.hashBinary(e.target.result)
        callback(null, md5sum)
      };
      reader.readAsBinaryString(file)
    },
    // 单个文件上传请求
    upload (chunk, type) {
      const formData = new FormData();
      // Object.keys(chunk)
      for (let key in chunk) {
        if (chunk.hasOwnProperty(key)) {
          formData.append(key, chunk[key]);
        }
      }
      uploadFile('http:\/\/localhost:8090', formData, function (res) {
        console.log(res);
        if (type === 'async' && chunk.index !== chunks.length) {
          task.upload(chunks[chunk.index + 1], type)
        }
      }, function () {
        task.upload(chunk, type);
      })
    },
    // type为async为按序上传，type为sync为同步上传
    uploadFile(chunks, type) {
      // 按序上传
      if (type === 'async') {
        task.upload(chunks[0], type);
      } else {
        // 同步一起上传
        for (let i = 0; i < chunks.length; i++) {
          task.upload(chunks[i], 'sync')
        }
      }
    }
  }

  const fileInput = document.getElementById('file');
  fileInput.addEventListener('change', function (evt) {
    const file = evt.target.files[0];
    const chunks = task.cutfile(file, 1024 * 1024);
    // 按序上传
    task.uploadFile(chunks, 'async');
  })
 }

