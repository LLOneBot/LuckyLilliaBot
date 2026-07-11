#!/usr/bin/env node
// Sweep multiple OneBot endpoints, capture cmds, write a discovery report.
import http from 'node:http'
import fs from 'node:fs'

const CAP_FILE = './sse-capture.jsonl'

function callOnebot(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body || '{}'
    const req = http.request({
      host: '127.0.0.1', port: 53000, path: '/' + endpoint, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 8000,
    }, res => {
      let buf = ''
      res.on('data', c => buf += c.toString('utf8'))
      res.on('end', () => resolve({ status: res.statusCode, body: buf }))
    })
    req.on('error', e => reject(e))
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.write(data)
    req.end()
  })
}

async function probe(endpoint, body) {
  const allLines = fs.readFileSync(CAP_FILE, 'utf8').split('\n').filter(Boolean)
  const startLine = Math.max(0, allLines.length - 6)
  let resp
  try { resp = await callOnebot(endpoint, body) } catch (e) { return { endpoint, err: e.message } }
  await new Promise(r => setTimeout(r, 2500))
  const newLines = fs.readFileSync(CAP_FILE, 'utf8').split('\n').filter(Boolean).slice(startLine)
  const bySeq = new Map()
  for (const l of newLines) {
    const [, , ...rest] = l.split('\t')
    let p
    try { p = JSON.parse(rest.join('\t')) } catch { continue }
    const d = p?.data
    if (!d || (p.type !== 'send' && p.type !== 'recv') || d.cmd === 'Heartbeat.Alive') continue
    if (!bySeq.has(d.seq)) bySeq.set(d.seq, { cmd: d.cmd, send: '', recv: '' })
    bySeq.get(d.seq)[p.type] = d.pb || ''
  }
  let respPreview
  try {
    const j = JSON.parse(resp.body)
    respPreview = j.status === 'ok' ? `OK retcode=${j.retcode}` : `FAIL: ${j.message || JSON.stringify(j).slice(0, 80)}`
  } catch { respPreview = resp.body.slice(0, 80) }
  return { endpoint, status: resp.status, respPreview, packets: [...bySeq.values()] }
}

const targets = [
  ['get_profile_like', '{"user_id":721011692,"start":0,"count":3}'],
  ['get_profile_like_me', '{"user_id":721011692,"start":0,"count":3}'],
  ['fetch_emoji_like', '{"group_id":1009098331}'],
  ['fetch_custom_face', '{}'],
  ['get_recommend_face', '{}'],
  ['get_robot_uin_range', '{}'],
  ['get_essence_msg_list', '{"group_id":1009098331}'],
  ['_get_group_notice', '{"group_id":1009098331}'],
  ['get_doubt_friends_add_request', '{}'],
  ['get_group_ignore_add_request', '{}'],
  ['get_friends_with_category', '{}'],
  ['get_credentials', '{"domain":"qun.qq.com"}'],
  ['get_csrf_token', '{}'],
  ['get_group_album_list', '{"group_id":1009098331}'],
  ['get_ai_characters', '{"group_id":1009098331,"chat_type":1}'],
]

;(async () => {
  for (const [ep, body] of targets) {
    const r = await probe(ep, body)
    console.log(`### ${r.endpoint} ###`)
    if (r.err) { console.log('  ERROR:', r.err); continue }
    console.log(`  resp: ${r.respPreview}`)
    if (r.packets.length === 0) {
      console.log('  no OIDB packets (HTTP/cached/local-only)')
    } else {
      for (const p of r.packets) {
        console.log(`  ${p.cmd}`)
        if (p.send) console.log(`    send (${p.send.length / 2}B): ${p.send.slice(0, 200)}${p.send.length > 200 ? '...' : ''}`)
      }
    }
    console.log()
  }
})()
