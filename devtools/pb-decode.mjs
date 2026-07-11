#!/usr/bin/env node
// Quick protobuf decoder - dumps tag/wire-type/value tree from a hex string.
// Usage: node devtools/pb-decode.mjs <hex>  OR  echo <hex> | node ...
import fs from 'node:fs'

const hex = process.argv[2] || fs.readFileSync(0, 'utf8').trim()
const buf = Buffer.from(hex, 'hex')

function readVarint(buf, off) {
  let v = 0n, shift = 0n, b
  do { b = buf[off++]; v |= BigInt(b & 0x7f) << shift; shift += 7n } while (b & 0x80)
  return [v, off]
}

function decode(buf, off, end, depth = 0, path = '') {
  const indent = '  '.repeat(depth)
  while (off < end) {
    let tag, _v
    [tag, off] = readVarint(buf, off)
    const tagN = Number(tag)
    const field = tagN >> 3
    const wire = tagN & 7
    const fp = path ? `${path}.${field}` : `${field}`

    if (wire === 0) { // varint
      let val
      [val, off] = readVarint(buf, off)
      console.log(`${indent}${fp} (varint): ${val}`)
    } else if (wire === 1) { // 64-bit
      const lo = buf.readUInt32LE(off), hi = buf.readUInt32LE(off + 4)
      console.log(`${indent}${fp} (64bit): lo=${lo} hi=${hi}`)
      off += 8
    } else if (wire === 2) { // length-delimited
      let len
      [len, off] = readVarint(buf, off)
      const lenN = Number(len)
      const inner = buf.slice(off, off + lenN)
      const utf8 = inner.toString('utf8')
      // Prefer string if entire content is valid printable UTF-8 (no NULs, ratio of weird bytes low)
      let isPrintableUtf8 = false
      try {
        if (lenN > 0 && !inner.includes(0)) {
          // Re-encode and compare to detect invalid UTF-8 sequences
          const reBytes = Buffer.from(utf8, 'utf8')
          if (reBytes.equals(inner) && /^[\x09\x0a\x0d\x20-\x7e -￿]*$/.test(utf8)) {
            isPrintableUtf8 = true
          }
        }
      } catch {}
      // Try to decode as nested message
      let isMsg = false
      try {
        let p = 0, count = 0
        while (p < lenN) {
          const [t, np] = readVarint(inner, p)
          const w = Number(t) & 7
          const f = Number(t) >> 3
          if (w > 5 || w === 3 || w === 4 || f === 0) { isMsg = false; break }
          isMsg = true; count++
          if (w === 0) { const [, np2] = readVarint(inner, np); p = np2 }
          else if (w === 1) p = np + 8
          else if (w === 5) p = np + 4
          else if (w === 2) {
            const [l, np2] = readVarint(inner, np)
            p = np2 + Number(l)
            if (p > lenN) { isMsg = false; break }
          }
        }
        if (count === 0) isMsg = false
      } catch { isMsg = false }
      // Bias: if string is preferred AND msg parse passes, default to string when length < 64
      // and the parsed structure looks suspicious (single field tag 0)
      if (isMsg && isPrintableUtf8) {
        // Heuristic: if first byte's tag would put field as 0, can't be a real message
        const [t0] = readVarint(inner, 0)
        const f0 = Number(t0) >> 3
        if (f0 === 0 || f0 > 256) isMsg = false
      }
      if (isMsg && lenN > 1 && !isPrintableUtf8) {
        console.log(`${indent}${fp} (msg, ${lenN}B):`)
        decode(inner, 0, lenN, depth + 1, fp)
      } else if (isPrintableUtf8) {
        console.log(`${indent}${fp} (string, ${lenN}B): ${JSON.stringify(utf8.slice(0, 100))}`)
      } else if (isMsg && lenN > 1) {
        console.log(`${indent}${fp} (msg, ${lenN}B):`)
        decode(inner, 0, lenN, depth + 1, fp)
      } else {
        console.log(`${indent}${fp} (bytes, ${lenN}B): ${inner.slice(0, 32).toString('hex')}${lenN > 32 ? '...' : ''}`)
      }
      off += lenN
    } else if (wire === 5) { // 32-bit
      const v = buf.readUInt32LE(off)
      console.log(`${indent}${fp} (32bit): ${v}`)
      off += 4
    } else {
      console.log(`${indent}${fp} (wire=${wire}): UNKNOWN`)
      break
    }
  }
}

decode(buf, 0, buf.length)
