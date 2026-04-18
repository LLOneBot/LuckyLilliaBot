import { createServer, IncomingMessage, ServerResponse } from 'node:http'

const PORT = Number(process.argv[2]) || 8080

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'POST') {
    let body = ''
    req.on('data', (chunk: Buffer) => body += chunk.toString())
    req.on('end', () => {
      try {
        const json = JSON.parse(body)
        console.log(`[${new Date().toLocaleTimeString()}] ${req.url}`, JSON.stringify(json, null, 2))
      } catch {
        console.log(`[${new Date().toLocaleTimeString()}] ${req.url}`, body)
      }
      res.writeHead(204)
      res.end()
    })
  } else {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`)
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  }
})

server.listen(PORT, () => {
  console.log(`HTTP server listening on http://localhost:${PORT}`)
  console.log('Waiting for POST events...\n')
})
