/*!
 * server implementation
 *
 * TODO 定期删除机制
 *
 * NOTICE 业务上的应用时，防止文件名一样，所以需要做特殊处理，比如根据放入不同的用户的文件夹中
 * NOTICE 还有就是根据文件名做文件夹名称是会有异常情况的
 * state: wip
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const url = require('url')
const querystring = require('querystring')
const formidable = require('formidable')

const { cacheChunk, concatCaches } = require('./lib')

const PORT = 10240

const allowCORS = function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}


// #0 启动服务
const server = http.createServer((req, res) => {
  allowCORS(req, res)
  const parsedUrl = url.parse(req.url)
  // #1 接收请求
  if (parsedUrl.pathname === '/upload' && req.method.toUpperCase() === 'POST') {
    const form = new formidable.IncomingForm()

    // #2 本地持久化
    form.uploadDir = path.join(__dirname, '../tmp')

    const handleException = (err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('error when save')
    }

    form.on('error', handleException)

    form.parse(req, (err, fields, file) => {
      // 持久化
      const { path: filePath } = file.blob
      const fileName = fields.fileName
      const fileDir = path.join(form.uploadDir, `../cache/${fileName}`)
      try {
        const exist = fs.existsSync(fileDir)
        const renameFile = () => {
          fs.rename(filePath, path.join(fileDir, `${fields.chunkIndex}_${fileName}`), (err) => {
            if (err) {
              handleException(err)
              return
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end('received')
          })
        }
        if (exist) {
          renameFile()
          return
        }
        fs.mkdir(fileDir, (err) => {
          if (err) {
            handleException(err)
            return
          }
          renameFile()
        })
      } catch (e) {
        handleException(e)
      }
      // #3 接收完所有的chunk（如何判断），最终合并
      // 客户端判断的话只有最后上传完之后再调用新的接口来通知服务端
      // 服务端判断的话就只有保持记录或者 loop
      // 先采用额外的接口来做吧
    })

    return
  }
  else if (parsedUrl.pathname === '/concat-caches' && req.method.toUpperCase() === 'GET') {
    const { fileName } = querystring.parse(parsedUrl.query)
    concatCaches(fileName, fileName, (err) => {
      if (err) {
        handleException(err)
        return
      }
      res.end('concat success')
    })
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(`
    <form action="/upload" enctype="multipart/form-data" method="post">
      <input type="text" name="index">
      <br>
      <input type="file" name="upload">
      <input type="submit" value="Upload">
    </form>
  `)
}).listen(PORT, () => console.log(`server start and listen port: ${PORT}.`))
