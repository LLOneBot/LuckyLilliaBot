import { WATCH_PROFILE as P } from '../profiles/watch'
import { buildWatchFetchTlvs, buildWatchLoginBody } from './tlv'
import { buildWatchWtLoginFrame, buildWatchCode2d } from './frame'
import { getWatchQimei } from './qimei'

// watch 请求帧构造。只依赖 client 的这几个方法, 用最小接口解耦 (避免与 client.ts 循环 import)。
export interface WatchFrameClient {
  getGuid(): Buffer
  getEcdhPublicKey(): Buffer
  getEcdhShareKey(): Buffer
}

const u16 = (v: number): Buffer => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b }
const u32 = (v: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b }

const CMD_TRANS_EMP = 2066
const CMD_LOGIN = 2064

/** trans_emp 0x31 拉码帧 (不签名)。 */
export function buildWatchFetchFrame(client: WatchFrameClient): Buffer {
  const guid = client.getGuid()
  const inner = Buffer.concat([u32(P.appId), Buffer.alloc(8), Buffer.from([0x00]), u16(0), buildWatchFetchTlvs(guid)])
  const code2d = buildWatchCode2d(0x31, inner)
  return buildWatchWtLoginFrame(0, CMD_TRANS_EMP, code2d, client.getEcdhPublicKey(), client.getEcdhShareKey())
}

/** trans_emp 0x12 轮询帧 (不签名)。 */
export function buildWatchPollFrame(client: WatchFrameClient, sig: Buffer): Buffer {
  const body = Buffer.concat([
    u32(P.appId), u16(sig.length), sig,
    Buffer.alloc(8), u32(0), Buffer.from([0x00, 0x03]),
  ])
  const code2d = buildWatchCode2d(0x12, body)
  return buildWatchWtLoginFrame(0, CMD_TRANS_EMP, code2d, client.getEcdhPublicKey(), client.getEcdhShareKey())
}

export interface WatchLoginQr {
  uin: string
  tgtgtKey: Buffer
  tempPassword: Buffer
  noPicSig: Buffer
}

/** wtlogin.login 帧 (由 SIGN_ALLOWLIST 走 FEKit 签名; 后端未就绪时 sendCommand 会 503)。 */
export function buildWatchLoginFrame(client: WatchFrameClient, qr: WatchLoginQr): Buffer {
  const guid = client.getGuid()
  const { q16 } = getWatchQimei(guid)
  const body = buildWatchLoginBody({
    uin: Number(qr.uin),
    guid,
    tgtgtKey: qr.tgtgtKey,
    tempPassword: qr.tempPassword,
    noPicSig: qr.noPicSig,
    q16,
    androidId: guid.toString('hex').slice(0, 16),
  })
  return buildWatchWtLoginFrame(Number(qr.uin), CMD_LOGIN, body, client.getEcdhPublicKey(), client.getEcdhShareKey())
}
