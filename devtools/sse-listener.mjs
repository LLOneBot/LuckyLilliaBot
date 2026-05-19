#!/usr/bin/env node
// SSE listener for PMHQ packet sniffer at http://localhost:13000
// Writes every event line to ./sse-capture.jsonl
import http from 'node:http'
import fs from 'node:fs'

const OUT = process.argv[2] || './sse-capture.jsonl'
const writer = fs.createWriteStream(OUT, { flags: 'a' })
console.log(`[sse-listener] capturing to ${OUT}`)

const req = http.request('http://127.0.0.1:13000/', { method: 'GET', headers: { 'Accept': 'text/event-stream' } }, res => {
  console.log('[sse-listener] status', res.statusCode)
  let buf = ''
  res.on('data', chunk => {
    buf += chunk.toString('utf8')
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const evt = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      // parse SSE lines
      const lines = evt.split('\n')
      let dataLine = ''
      let evtType = 'message'
      for (const l of lines) {
        if (l.startsWith('data:')) dataLine += l.slice(5).trim()
        else if (l.startsWith('event:')) evtType = l.slice(6).trim()
      }
      if (dataLine) {
        const ts = new Date().toISOString()
        writer.write(`${ts}\t${evtType}\t${dataLine}\n`)
        // log a one-line preview
        try {
          const obj = JSON.parse(dataLine)
          const cmd = obj.cmd || obj.command || obj.type || ''
          const dir = obj.direction || obj.dir || ''
          const sz = (obj.payload || obj.data || obj.pb || '').length
          console.log(`[${ts}] ${evtType} ${dir} ${cmd} (${sz}B)`)
        } catch {
          console.log(`[${ts}] ${evtType} ${dataLine.slice(0, 80)}`)
        }
      }
    }
  })
  res.on('end', () => { console.log('[sse-listener] stream ended'); process.exit(0) })
})
req.on('error', e => { console.log('[sse-listener] error', e.message); process.exit(1) })
req.end()

process.on('SIGINT', () => { writer.end(); process.exit(0) })
process.on('SIGTERM', () => { writer.end(); process.exit(0) })
