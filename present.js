/*!
 * bootstrap to present test | bqliu
 */

const path = require('path')
const StaticServer = require('static-server')
const opn = require('opn')
const portfinder = require('portfinder')

portfinder.getPort((err, port) => {
  if (err) {
    throw err
  }

  const server = new StaticServer({
    rootPath: '.',
    port: port,
    name: 'hentai'
  })

  server.start(() => {
    console.log('static-server started, listen to', server.port)

    opn(`http://localhost:${server.port}/browser/index.html`)
  })
})
