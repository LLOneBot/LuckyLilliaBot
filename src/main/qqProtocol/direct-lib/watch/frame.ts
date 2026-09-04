import { randomBytes } from 'node:crypto'
import { teaEncrypt } from '../tea'
import { WATCH_PROFILE as P } from '../profiles/watch'

const u16 = (v: number): Buffer => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b }
const u32 = (v: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b }

// watch oicq/wtlogin frame (P-256 layout, cipher-suite 0x0131)。移植 POC build_wtlogin_frame。
// cmdId: wtlogin.login=2064, wtlogin.trans_emp=2066。
export function buildWatchWtLoginFrame(uin: number, cmdId: number, body: Buffer, pubKey: Buffer, shareKey: Buffer): Buffer {
  const encrypted = Buffer.from(teaEncrypt(body, shareKey))
  const randomKey = randomBytes(16)

  const inner = Buffer.concat([
    Buffer.from([0x02]),
    u16(0),            // total-len 占位, 下面 patch
    u16(8001),
    u16(cmdId),
    u16(1),
    u32(uin),
    Buffer.from([0x03, 0x87, 0x00]),
    u32(2),
    u32(0),            // app client version (watch=0)
    u32(0),
    Buffer.from([0x02, 0x01]),
    randomKey,
    u16(P.wtLoginCipherSuite), // 0x0131 (P-256)
    u16(1),            // SvrPublicKeyVer
    u16(pubKey.length),
    pubKey,
    encrypted,
    Buffer.from([0x03]),
  ])
  inner.writeUInt16BE(inner.length, 1) // total-len (self-inclusive)
  return inner
}

// trans_emp code2d 外壳。移植 POC build_code2d。
export function buildWatchCode2d(subCommand: number, inner: Buffer): Buffer {
  const ts = Math.floor(Date.now() / 1000)
  const requestBody = Buffer.concat([
    u32(ts),
    Buffer.from([0x02]),
    u16(46 + inner.length),
    u16(subCommand),
    Buffer.alloc(21),
    Buffer.from([0x03]),
    u32(0x32),
    u16(0),
    u32(0),
    Buffer.alloc(8), // u64(0)
    inner,
    Buffer.from([0x03]),
  ])

  return Buffer.concat([
    Buffer.from([0x00]),
    u16(requestBody.length),
    u32(P.appId),   // 16
    u32(0x72),
    Buffer.alloc(3),
    requestBody,
  ])
}
