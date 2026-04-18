import { WebSocketServer, type RawData } from 'ws'

const PORT = Number(process.argv[2]) || 8081

const wss = new WebSocketServer({ port: PORT })

wss.on('listening', () => {
  console.log(`WebSocket server listening on ws://localhost:${PORT}`)
  console.log('Waiting for connections...\n')
})

wss.on('connection', (ws, req) => {
  console.log(`[${new Date().toLocaleTimeString()}] Client connected from ${req.socket.remoteAddress}`)

  ws.on('message', (data: RawData) => {
    try {
      const json = JSON.parse(data.toString())
      console.log(`[${new Date().toLocaleTimeString()}]`, JSON.stringify(json, null, 2))
    } catch {
      console.log(`[${new Date().toLocaleTimeString()}]`, data.toString())
    }
  })

  ws.on('close', () => {
    console.log(`[${new Date().toLocaleTimeString()}] Client disconnected`)
  })
})
