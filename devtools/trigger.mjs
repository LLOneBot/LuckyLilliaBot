#!/usr/bin/env node
// Trigger an OneBot call via http://127.0.0.1:53000 and capture all SSE events
// that fire during a window around the call. Writes the captured cmds/pb to
// stdout, which we can then decode to figure out protocol.
//
// Usage: node trigger.mjs <onebot-endpoint> [postBodyJson]
//   e.g. node trigger.mjs _get_group_notice '{"group_id":1009098331}'
import http from 'node:http'
import fs from 'node:fs'

const endpoint = process.argv[2]
const body = process.argv[3] || '{}'
if (!endpoint) {
  console.error('Usage: node trigger.mjs <endpoint> [body-json]')
  process.exit(1)
}

const CAP_FILE = './sse-capture.jsonl'
const startSize = fs.existsSync(CAP_FILE) ? fs.statSync(CAP_FILE).size : 0
// Look back a few lines to catch the send packet that may appear immediately
// before our trigger marker due to pre-call OneBot internal calls.
const allStart = fs.existsSync(CAP_FILE) ? fs.readFileSync(CAP_FILE, 'utf8').split('\n').filter(Boolean).length : 0
const startLines = Math.max(0, allStart - 6)
console.error(`[trigger] starting from line ${startLines} (back-buffer ${allStart - startLines}), calling /${endpoint}`)

function callOnebot() {
  return new Promise((resolve, reject) => {
    const data = body
    const req = http.request({
      host: '127.0.0.1', port: 53000, path: '/' + endpoint, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let buf = ''
      res.on('data', c => buf += c.toString('utf8'))
      res.on('end', () => resolve({ status: res.statusCode, body: buf }))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

;(async () => {
  const t0 = Date.now()
  let result
  try {
    result = await callOnebot()
  } catch (e) {
    console.error('[trigger] onebot call error:', e.message)
    process.exit(1)
  }
  // wait extra for SSE to flush; OIDB roundtrip can be slow
  await new Promise(r => setTimeout(r, 2500))
  const t1 = Date.now()

  // Read new lines from capture file (be lenient - take everything after the marker)
  const allLines = fs.readFileSync(CAP_FILE, 'utf8').split('\n').filter(Boolean)
  const newLines = allLines.slice(startLines)
  const events = newLines.map(l => {
    const [ts, evtType, ...rest] = l.split('\t')
    try { return { ts, evtType, parsed: JSON.parse(rest.join('\t')) } }
    catch { return { ts, evtType, raw: rest.join('\t') } }
  })
  // Group by seq so send/recv come paired
  const bySeq = new Map()
  for (const e of events) {
    const d = e.parsed?.data
    if (!d || (e.parsed.type !== 'send' && e.parsed.type !== 'recv')) continue
    if (d.cmd === 'Heartbeat.Alive') continue
    if (!bySeq.has(d.seq)) bySeq.set(d.seq, { cmd: d.cmd, send: null, recv: null })
    bySeq.get(d.seq)[e.parsed.type] = d.pb
  }

  console.log('=== OneBot response (status %d, %dms) ===', result.status, t1 - t0)
  console.log(result.body.slice(0, 800))
  console.log('=== %d distinct OIDB cmds captured ===', bySeq.size)
  for (const [seq, info] of bySeq) {
    console.log(`seq=${seq} cmd=${info.cmd}`)
    if (info.send) console.log(`  send (${info.send.length / 2}B): ${info.send.slice(0, 240)}${info.send.length > 240 ? '...' : ''}`)
    if (info.recv) console.log(`  recv (${info.recv.length / 2}B): ${info.recv.slice(0, 240)}${info.recv.length > 240 ? '...' : ''}`)
  }
})()
