import { DirectProtocolClient } from './client'
import { Cmd } from './cmd'
import { getLogger } from '@/common/logger'
import { AppInfo, DeviceInfo } from './appInfo'
import { getActiveProfile } from './profiles'

// --- Protobuf encoding helpers ---

function encodeVarint(value: number | bigint): Buffer {
  const bytes: number[] = []
  let v = typeof value === 'bigint' ? value : BigInt(value)
  if (v === 0n) {
    bytes.push(0)
  } else {
    while (v > 0n) {
      const b = Number(v & 0x7fn)
      v >>= 7n
      bytes.push(v > 0n ? b | 0x80 : b)
    }
  }
  return Buffer.from(bytes)
}

function protoTag(field: number, wireType: number): Buffer {
  return encodeVarint((field << 3) | wireType)
}

function protoVarintField(field: number, value: number | bigint): Buffer {
  return Buffer.concat([protoTag(field, 0), encodeVarint(value)])
}

function protoStringField(field: number, value: string): Buffer {
  const data = Buffer.from(value, 'utf-8')
  return Buffer.concat([protoTag(field, 2), encodeVarint(data.length), data])
}

function protoBytesField(field: number, data: Buffer): Buffer {
  return Buffer.concat([protoTag(field, 2), encodeVarint(data.length), data])
}

function protoMessageField(field: number, content: Buffer): Buffer {
  return protoBytesField(field, content)
}

// --- SsoHeartBeat ---

// Real QQ 3.2.28 SsoHeartBeat body = {f1:1, f2:{f1:0}, f3:0, f4:unix_seconds} (14B). The old
// {f1:1} (2B) was a stripped shape = a per-heartbeat fingerprint tell (aligned 2026-10-06).
function buildSsoHeartBeat(): Buffer {
  return Buffer.concat([
    protoVarintField(1, 1),
    protoMessageField(2, protoVarintField(1, 0)),
    protoVarintField(3, 0),
    protoVarintField(4, Math.floor(Date.now() / 1000)),
  ])
}

// --- SsoInfoSync (Register) ---

function buildRegisterDeviceInfo(): Buffer {
  const parts: Buffer[] = []
  parts.push(protoStringField(1, DeviceInfo.devName))
  parts.push(protoStringField(2, AppInfo.kernel))
  parts.push(protoStringField(3, getActiveProfile().systemKernel))
  parts.push(protoStringField(4, ''))
  parts.push(protoStringField(5, AppInfo.vendorOs))
  return Buffer.concat(parts)
}

function buildRegisterInfo(guid: Buffer, isFirstOnline: boolean = true): Buffer {
  const parts: Buffer[] = []
  parts.push(protoStringField(1, guid.toString('hex')))
  parts.push(protoVarintField(2, 0))
  parts.push(protoStringField(3, AppInfo.currentVersion))
  parts.push(protoVarintField(4, isFirstOnline ? 1 : 0))
  parts.push(protoVarintField(5, 2052))
  parts.push(protoMessageField(6, buildRegisterDeviceInfo()))
  parts.push(protoVarintField(7, 0))
  // f8/f9/f10 match real QQ 3.2.28 capture (was 6/0/{1,1}, diverged; aligned 2026-10-05)
  parts.push(protoVarintField(8, 0))
  parts.push(protoVarintField(9, 1))
  const bizInfo = Buffer.concat([
    protoVarintField(1, 0),
    protoVarintField(2, 0),
  ])
  parts.push(protoMessageField(10, bizInfo))
  parts.push(protoVarintField(11, 0))
  parts.push(protoVarintField(12, 1))
  return Buffer.concat(parts)
}

// c2c/group sync cookies are empty on real QQ 3.2.28 (old impl wrote {1:0})
function buildC2cMsgCookie(): Buffer {
  return Buffer.alloc(0)
}

export function buildSsoInfoSync(guid: Buffer, isFirstOnline: boolean = true): Buffer {
  const parts: Buffer[] = []
  // f1 = 1759 on real QQ 3.2.28 (was 735, diverged; aligned 2026-10-05)
  parts.push(protoVarintField(1, 1759))
  parts.push(protoVarintField(2, Math.floor(Math.random() * 0xFFFFFFFF)))
  parts.push(protoVarintField(4, 2))
  parts.push(protoVarintField(5, 0n))

  const c2cSync = Buffer.concat([
    protoMessageField(1, buildC2cMsgCookie()),
    protoVarintField(2, 0n),
    protoMessageField(3, buildC2cMsgCookie()),
  ])
  parts.push(protoMessageField(6, c2cSync))

  // real QQ 3.2.28 sends an empty top-level f8 (Bot omitted it)
  parts.push(protoMessageField(8, Buffer.alloc(0)))

  parts.push(protoMessageField(9, buildRegisterInfo(guid, isFirstOnline)))

  // real QQ 3.2.28: f10 = { f2:0, f4:{ f1:0 } } (old {1:0,2:2} had wrong shape)
  const f10 = Buffer.concat([
    protoVarintField(2, 0),
    protoMessageField(4, protoVarintField(1, 0)),
  ])
  parts.push(protoMessageField(10, f10))

  const appState = Buffer.concat([
    protoVarintField(1, 0),
    protoVarintField(2, 0),
    protoVarintField(3, 0),
  ])
  parts.push(protoMessageField(11, appState))

  return Buffer.concat(parts)
}

// --- Parse SsoInfoSync response ---

function parseRegisterResponse(data: Buffer): string | null {
  const field7 = decodeProtoLenDelim(data, 7)
  if (!field7) return null
  const msgBuf = decodeProtoLenDelim(field7, 2)
  if (!msgBuf) return null
  return msgBuf.toString('utf-8')
}

function decodeProtoLenDelim(data: Buffer, targetField: number): Buffer | null {
  let offset = 0
  while (offset < data.length) {
    let tag = 0
    let shift = 0
    while (offset < data.length) {
      const b = data[offset++]
      tag |= (b & 0x7f) << shift
      if ((b & 0x80) === 0) break
      shift += 7
    }
    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07

    if (wireType === 0) {
      while (offset < data.length && (data[offset] & 0x80) !== 0) offset++
      offset++
    } else if (wireType === 2) {
      let len = 0
      let lenShift = 0
      while (offset < data.length) {
        const b = data[offset++]
        len |= (b & 0x7f) << lenShift
        if ((b & 0x80) === 0) break
        lenShift += 7
      }
      if (fieldNumber === targetField) {
        return data.subarray(offset, offset + len)
      }
      offset += len
    } else if (wireType === 5) {
      offset += 4
    } else if (wireType === 1) {
      offset += 8
    } else {
      break
    }
  }
  return null
}

// --- Public API ---

export async function registerOnline(client: DirectProtocolClient): Promise<string> {
  const payload = buildSsoInfoSync(client.getGuid())

  const resp = await client.sendCommand(
    Cmd.Session.InfoSync,
    payload,
    undefined,
    10000,
  )

  const message = parseRegisterResponse(resp.payload) || 'ok'
  return message
}

export async function sendHeartbeat(client: DirectProtocolClient): Promise<void> {
  const payload = buildSsoHeartBeat()
  await client.sendCommand(
    Cmd.Session.Heartbeat,
    payload,
    undefined,
    5000,
  )
}

/**
 * 心跳 loop. 失败不能只 log 了事 -- 链路或凭据出问题时 selfInfo.online 会停在 true, 变成收不到
 * 消息的"假在线". 故失败后转 30s 快重试, 连挂 MAX_FAILURES 次 (或 session 已被判失效清掉) 就主动断开,
 * 交给 close -> scheduleReconnect 重建, 最坏约 5.5 分钟能测出来.
 */
export function startHeartbeat(client: DirectProtocolClient): () => void {
  // Real QQ 3.2.28 SsoHeartBeat cadence ~378s with natural jitter (was dead-exact 270s = a tell).
  const nextInterval = () => 374_000 + Math.floor(Math.random() * 8_000)
  const RETRY_INTERVAL = 30 * 1000
  const MAX_FAILURES = 3

  const logger = getLogger('heartbeat')
  let timer: NodeJS.Timeout | null = null
  let failures = 0
  let stopped = false

  const schedule = (delay: number) => {
    if (!stopped) timer = setTimeout(tick, delay)
  }

  const tick = async () => {
    if (stopped) return
    try {
      await sendHeartbeat(client)
      failures = 0
      schedule(nextInterval())
    } catch (e) {
      failures++
      logger.error(`[Heartbeat] Failed (${failures}/${MAX_FAILURES}):`, (e as Error).message)
      if (failures >= MAX_FAILURES || !client.isLoggedIn) {
        stopped = true
        logger.error('[Heartbeat] giving up, disconnecting to force a reconnect')
        client.disconnect()
        return
      }
      schedule(RETRY_INTERVAL)
    }
  }

  schedule(nextInterval())

  return () => {
    stopped = true
    if (timer) { clearTimeout(timer); timer = null }
  }
}
