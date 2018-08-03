/*!
 * server implementation
 *
 * 本模块主要用于简单的 缓存文件和将换承诺文件合并
 *
 * state: wip
 */

const fs = require('fs')
const path = require('path')

// 名称的格式设置为 `chunkIndex_fullFileName[fileName.fileExt]`
const getCacheFileName = (fileName, index) => {
  return `${index}_${fileName}`
}

// 从 cache 文件名中拿到 `chunkIndex`
const getIndexOfCacheFile = (fileName) => {
  return fileName.split('_')[0]
}

// 缓存 blob 到本地
const cacheChunk = (chunkIndex, fileName, blob, callback) => {
  const blobStream = fs.createReadStream(blob)
  blobStream.on('error', (err) => callback(err))

  const cacheFileName = getCacheFileName(fileName, index)
  const cacheStream = fs.createWriteStream(path.join(__dirname, `../cache/${fileName}/${cacheFileName}`))
  cacheStream.on('end', () => callback(null))
  cacheStream.on('error', (err) => callback(err))

  blobStream.pipe(cacheStream)
}

// 合并 cacheFiles 然后输出 合并后的文件
const concatCaches = (cacheDirectory, outputName, callback) => {
  // #0 查找所有文件
  fs.readdir(path.join(__dirname, `../cache/${cacheDirectory}`), (err, cacheFiles) => {
    if (err) {
      callback(err)
      return
    }

    if (cacheFiles.length === 0) {
      callback(null)
      return
    }

    // #1 进行排序 —— 升序
    const caches = cacheFiles.sort((prev, next) => {
      const prevIndex = getIndexOfCacheFile(prev)
      const nextIndex = getIndexOfCacheFile(next)

      return prevIndex - nextIndex
    })

    // #2 输出流
    const outputFile = fs.createWriteStream(path.join(__dirname, `../file/${outputName}`), { flags: 'w+' })

    outputFile.on('error', (err) => {
      console.error('output error:', err)
    })

    // #3 按序遍历文件，pipe 到输出流
    // 输入单个缓存到输出
    const pipeCache = (cacheName, writable, callback) => {
      const cacheStream = fs.createReadStream(path.join(__dirname, `../cache/${cacheDirectory}/${cacheName}`))

      // 不能结束
      cacheStream.pipe(writable, { end: false })

      cacheStream.on('end', () => callback(null))
      cacheStream.on('error', (err) => callback(err))
    }

    // #4 生成任务队列
    const tasks = caches.map((cacheName, index) => {
      // closure
      return () => pipeCache(cacheName, outputFile, (err) => {
        if (err) {
          console.error('output error:', err)
          outputFile.end()
          callback(err)
          return
        }
        // 不是最后一个就 next
        if (index + 1 !== caches.length) {
          tasks[index + 1]()
          return
        }
        // 所有的都已 pipe 完

        console.log('output success')
        // 注意 `end`
        outputFile.end()

        callback(null)
      })
    })

    // 执行任务队列
    tasks[0]()
  })
}

// 测试用
const testConcatCaches = () => {
  concatCaches('hy.jpg', 'hy.jpg', (err) => {
    if (err) {
      console.error('error:', err)
      return
    }

    console.log('complete')
  })
}

// testConcatCaches()

module.exports = {
  cacheChunk,
  concatCaches
}
