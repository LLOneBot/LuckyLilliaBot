/**
 * SSO/Service packet packing and parsing for QQ protocol
 * Implements Protocol 12/13 framing with TEA encryption
 */

import { teaEncrypt, teaDecrypt } from './tea'
import { randomBytes, createHash } from 'node:crypto'

export enum EncryptType {
  NoEncrypt = 0x00,
  EncryptD2Key = 0x01,
  EncryptEmpty = 0x02,
}

export interface SsoPacket {
  seq: number
  cmd: string
  payload: Buffer
}

export interface PacketContext {
  uin: string
  d2: Buffer
  d2Key: Buffer
  tgt: Buffer
  guid: Buffer
  appId: number
  subAppId: number
  ssoVersion: number
  buildVer: string
}

const EMPTY_KEY = Buffer.alloc(16)

/**
 * Build SSO frame (Protocol 12)
 */
function buildSsoHeader(seq: number, cmd: string, ctx: PacketContext, payload: Buffer): Buffer {
  const cmdBuf = Buffer.from(cmd)
  const guidBuf = ctx.guid
  const buildVerBuf = Buffer.from(ctx.buildVer)

  // SSO header
  const headerParts: Buffer[] = []

  // Sequence
  const seqBuf = Buffer.alloc(4)
  seqBuf.writeUInt32BE(seq)
  headerParts.push(seqBuf)

  // App ID
  const appIdBuf = Buffer.alloc(4)
  appIdBuf.writeUInt32BE(ctx.appId)
  headerParts.push(appIdBuf)

  // Sub App ID
  const subAppIdBuf = Buffer.alloc(4)
  subAppIdBuf.writeUInt32BE(ctx.subAppId)
  headerParts.push(subAppIdBuf)

  // Unknown fixed bytes
  headerParts.push(Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00]))

  // Tgt with length prefix
  const tgtLen = Buffer.alloc(4)
  tgtLen.writeUInt32BE(ctx.tgt.length + 4)
  headerParts.push(tgtLen)
  headerParts.push(ctx.tgt)

  // Command with length prefix
  const cmdLenBuf = Buffer.alloc(4)
  cmdLenBuf.writeUInt32BE(cmdBuf.length + 4)
  headerParts.push(cmdLenBuf)
  headerParts.push(cmdBuf)

  // Session ID (random 4 bytes)
  const sessionId = randomBytes(4)
  const sessionLenBuf = Buffer.alloc(4)
  sessionLenBuf.writeUInt32BE(8)
  headerParts.push(sessionLenBuf)
  headerParts.push(sessionId)

  // GUID with length prefix
  const guidLenBuf = Buffer.alloc(4)
  guidLenBuf.writeUInt32BE(guidBuf.length + 4)
  headerParts.push(guidLenBuf)
  headerParts.push(guidBuf)

  // Build version with length prefix
  const buildVerLenBuf = Buffer.alloc(4)
  buildVerLenBuf.writeUInt32BE(buildVerBuf.length + 4)
  headerParts.push(buildVerLenBuf)
  headerParts.push(buildVerBuf)

  const ssoHeader = Buffer.concat(headerParts)

  // Combine: [4-byte sso header length][sso header][4-byte payload length][payload]
  const ssoHeaderLen = Buffer.alloc(4)
  ssoHeaderLen.writeUInt32BE(ssoHeader.length + 4)
  const payloadLen = Buffer.alloc(4)
  payloadLen.writeUInt32BE(payload.length + 4)

  return Buffer.concat([ssoHeaderLen, ssoHeader, payloadLen, payload])
}

/**
 * Build the service frame (outer packet with encryption)
 */
export function buildServicePacket(
  seq: number,
  cmd: string,
  ctx: PacketContext,
  payload: Buffer,
  encryptType: EncryptType = EncryptType.EncryptD2Key,
): Buffer {
  const ssoBody = buildSsoHeader(seq, cmd, ctx, payload)

  // Encrypt SSO body
  let encrypted: Buffer
  switch (encryptType) {
    case EncryptType.EncryptD2Key:
      encrypted = Buffer.from(teaEncrypt(ssoBody, ctx.d2Key))
      break
    case EncryptType.EncryptEmpty:
      encrypted = Buffer.from(teaEncrypt(ssoBody, EMPTY_KEY))
      break
    case EncryptType.NoEncrypt:
      encrypted = ssoBody
      break
  }

  // Service header
  const uinStr = ctx.uin
  const uinBuf = Buffer.from(uinStr)

  const parts: Buffer[] = []

  // Protocol version (12)
  const versionBuf = Buffer.alloc(4)
  versionBuf.writeUInt32BE(12)
  parts.push(versionBuf)

  // Encrypt type
  const encTypeBuf = Buffer.alloc(1)
  encTypeBuf.writeUInt8(encryptType)
  parts.push(encTypeBuf)

  // D2 token with length prefix (for D2 encryption)
  if (encryptType === EncryptType.EncryptD2Key) {
    const d2Len = Buffer.alloc(4)
    d2Len.writeUInt32BE(ctx.d2.length + 4)
    parts.push(d2Len)
    parts.push(ctx.d2)
  } else {
    const d2Len = Buffer.alloc(4)
    d2Len.writeUInt32BE(4)
    parts.push(d2Len)
  }

  // Unknown byte
  parts.push(Buffer.from([0x00]))

  // UIN string with length prefix
  const uinLenBuf = Buffer.alloc(4)
  uinLenBuf.writeUInt32BE(uinBuf.length + 4)
  parts.push(uinLenBuf)
  parts.push(uinBuf)

  // Encrypted body
  parts.push(encrypted)

  const innerPacket = Buffer.concat(parts)

  // Outer frame: 4-byte big-endian total length (including itself)
  const frame = Buffer.alloc(4 + innerPacket.length)
  frame.writeUInt32BE(4 + innerPacket.length)
  innerPacket.copy(frame, 4)

  return frame
}

/**
 * Parse incoming service packet
 */
export function parseServicePacket(frame: Buffer, d2Key: Buffer): SsoPacket | null {
  if (frame.length < 4) return null

  let offset = 0

  // Protocol version
  const version = frame.readUInt32BE(offset); offset += 4
  // Encrypt type
  const encType = frame.readUInt8(offset); offset += 1

  // Skip D2 token
  if (offset + 4 > frame.length) return null
  const d2Len = frame.readUInt32BE(offset); offset += 4
  offset += d2Len - 4

  // Skip unknown byte
  offset += 1

  // UIN string
  if (offset + 4 > frame.length) return null
  const uinLen = frame.readUInt32BE(offset); offset += 4
  offset += uinLen - 4

  // Encrypted body
  const encBody = frame.subarray(offset)

  // Decrypt
  let ssoBody: Buffer
  switch (encType) {
    case EncryptType.EncryptD2Key:
      ssoBody = Buffer.from(teaDecrypt(encBody, d2Key))
      break
    case EncryptType.EncryptEmpty:
      ssoBody = Buffer.from(teaDecrypt(encBody, EMPTY_KEY))
      break
    default:
      ssoBody = Buffer.from(encBody)
  }

  // Parse SSO header
  return parseSsoBody(ssoBody)
}

function parseSsoBody(data: Buffer): SsoPacket | null {
  let offset = 0

  // SSO header length
  if (offset + 4 > data.length) return null
  const headerLen = data.readUInt32BE(offset); offset += 4
  const headerEnd = offset + headerLen - 4

  // Sequence
  const seq = data.readInt32BE(offset); offset += 4
  // Skip retcode
  offset += 4
  // Skip extra
  const extraLen = data.readUInt32BE(offset); offset += 4
  offset += extraLen - 4

  // Command
  const cmdLen = data.readUInt32BE(offset); offset += 4
  const cmd = data.subarray(offset, offset + cmdLen - 4).toString()
  offset = headerEnd

  // Payload length
  if (offset + 4 > data.length) return null
  const payloadLen = data.readUInt32BE(offset); offset += 4
  const payload = Buffer.from(data.subarray(offset, offset + payloadLen - 4))

  return { seq, cmd, payload }
}
