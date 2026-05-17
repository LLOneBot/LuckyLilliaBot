/**
 * SSO/Service packet packing and parsing for QQ protocol
 * Protocol 12 (D2Auth) and Protocol 13 (Simple)
 *
 * Service Frame structure (Protocol 12):
 *   [int32: total length (including self)]
 *   [int32: 12 (protocol version)]
 *   [byte: encrypt type]
 *   [int32+data: D2 token with length prefix (or just int32=4 if empty)]
 *   [byte: 0x00]
 *   [int32+string: UIN decimal string with length prefix]
 *   [bytes: TEA encrypted SSO body]
 *
 * SSO Head structure (Protocol 12):
 *   [int32: head length (including self)]
 *   [int32: sequence]
 *   [int32: subAppId]
 *   [int16: 2052 (0x0804)]
 *   [12 bytes: fixed header]
 *   [int32+data: A2/tgt with length prefix]
 *   [int32+string: command with length prefix]
 *   [int32+data: empty with length prefix]
 *   [int32+string: GUID hex string with length prefix]
 *   [int32+data: empty with length prefix]
 *   [int16+string: app version with length prefix]
 *   [int32+data: reserved field with length prefix]
 */

import { teaEncrypt, teaDecrypt } from './tea'
import { buildSsoReservedField } from './ssoReserved'
import type { SignResult } from './sign'
import { randomBytes } from 'node:crypto'

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
  tgt: Buffer   // A2 token
  guid: Buffer
  appId: number
  subAppId: number
  buildVer: string
}

const EMPTY_KEY = Buffer.alloc(16)
const FIXED_HEADER = Buffer.from([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

function writeInt32Prefixed(data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeInt32BE(data.length + 4)
  return Buffer.concat([len, data])
}

function writeInt32PrefixedString(str: string): Buffer {
  return writeInt32Prefixed(Buffer.from(str))
}

function writeInt16PrefixedString(str: string): Buffer {
  const strBuf = Buffer.from(str)
  const len = Buffer.alloc(2)
  len.writeInt16BE(strBuf.length + 2)
  return Buffer.concat([len, strBuf])
}

/**
 * Build SSO Head (Protocol 12)
 */
function buildSsoHead12(seq: number, cmd: string, ctx: PacketContext, signResult?: SignResult | null): Buffer {
  const parts: Buffer[] = []

  // Sequence
  const seqBuf = Buffer.alloc(4)
  seqBuf.writeInt32BE(seq)
  parts.push(seqBuf)

  // SubAppId
  const subAppBuf = Buffer.alloc(4)
  subAppBuf.writeInt32BE(ctx.subAppId)
  parts.push(subAppBuf)

  // Fixed int32: 2052
  const fixed2052 = Buffer.alloc(4)
  fixed2052.writeInt32BE(2052)
  parts.push(fixed2052)

  // Fixed 12 bytes
  parts.push(FIXED_HEADER)

  // A2/tgt with int32 length prefix
  parts.push(writeInt32Prefixed(ctx.tgt))

  // Command with int32 length prefix
  parts.push(writeInt32PrefixedString(cmd))

  // Empty with int32 length prefix
  parts.push(writeInt32Prefixed(Buffer.alloc(0)))

  // GUID as lowercase hex string with int32 length prefix
  parts.push(writeInt32PrefixedString(ctx.guid.toString('hex')))

  // Empty with int32 length prefix
  parts.push(writeInt32Prefixed(Buffer.alloc(0)))

  // App version with int16 length prefix
  parts.push(writeInt16PrefixedString(ctx.buildVer))

  // Reserved field with int32 length prefix (SsoReservedField protobuf)
  const reservedField = buildSsoReservedField(ctx.uin !== '0' ? ctx.uin : undefined, signResult)
  parts.push(writeInt32Prefixed(reservedField))

  const head = Buffer.concat(parts)

  // Wrap with int32 length prefix (including the 4-byte prefix itself)
  return writeInt32Prefixed(head)
}

/**
 * Build SSO Head (Protocol 13 - Simple, used for Heartbeat.Alive)
 * Only contains: command + empty + reservedField
 */
function buildSsoHead13(cmd: string, ctx: PacketContext): Buffer {
  const parts: Buffer[] = []
  parts.push(writeInt32PrefixedString(cmd))
  parts.push(writeInt32Prefixed(Buffer.alloc(0)))
  const reservedField = buildSsoReservedField(ctx.uin !== '0' ? ctx.uin : undefined)
  parts.push(writeInt32Prefixed(reservedField))
  const head = Buffer.concat(parts)
  return writeInt32Prefixed(head)
}

function buildSsoFrame13(cmd: string, ctx: PacketContext, payload: Buffer): Buffer {
  const head = buildSsoHead13(cmd, ctx)
  const payloadWithLen = writeInt32Prefixed(payload)
  return Buffer.concat([head, payloadWithLen])
}

/**
 * Build Service frame (Protocol 13) - for Heartbeat.Alive etc
 */
export function buildServicePacket13(
  seq: number,
  cmd: string,
  ctx: PacketContext,
  payload: Buffer,
  encryptType: EncryptType = EncryptType.NoEncrypt,
): Buffer {
  const ssoFrame = buildSsoFrame13(cmd, ctx, payload)

  let encrypted: Buffer
  switch (encryptType) {
    case EncryptType.EncryptD2Key:
      encrypted = Buffer.from(teaEncrypt(ssoFrame, ctx.d2Key))
      break
    case EncryptType.EncryptEmpty:
      encrypted = Buffer.from(teaEncrypt(ssoFrame, EMPTY_KEY))
      break
    case EncryptType.NoEncrypt:
    default:
      encrypted = ssoFrame
  }

  const parts: Buffer[] = []

  // Protocol version 13 (int32)
  const verBuf = Buffer.alloc(4)
  verBuf.writeInt32BE(13)
  parts.push(verBuf)

  // Encrypt type (byte)
  parts.push(Buffer.from([encryptType]))

  // Sequence (int32) — Protocol 13 includes seq in service frame
  const seqBuf = Buffer.alloc(4)
  seqBuf.writeInt32BE(seq)
  parts.push(seqBuf)

  // Dummy byte
  parts.push(Buffer.from([0x00]))

  // UIN string with int32 length prefix
  parts.push(writeInt32PrefixedString(ctx.uin))

  // Encrypted body
  parts.push(encrypted)

  const innerPacket = Buffer.concat(parts)

  // Outer frame: int32 total length (including self)
  const frame = Buffer.alloc(4 + innerPacket.length)
  frame.writeInt32BE(4 + innerPacket.length)
  innerPacket.copy(frame, 4)

  return frame
}

/**
 * Build complete SSO frame (head + payload) for Protocol 12
 */
function buildSsoFrame12(seq: number, cmd: string, ctx: PacketContext, payload: Buffer, signResult?: SignResult | null): Buffer {
  const head = buildSsoHead12(seq, cmd, ctx, signResult)
  const payloadWithLen = writeInt32Prefixed(payload)
  return Buffer.concat([head, payloadWithLen])
}

/**
 * Build Service frame (Protocol 12) - the outermost packet sent over TCP
 */
export function buildServicePacket(
  seq: number,
  cmd: string,
  ctx: PacketContext,
  payload: Buffer,
  encryptType: EncryptType = EncryptType.EncryptD2Key,
  signResult?: SignResult | null,
): Buffer {
  // Build SSO frame
  const ssoFrame = buildSsoFrame12(seq, cmd, ctx, payload, signResult)

  // Debug: dump SSO frame before encryption
  if (cmd.includes('trans_emp')) {
    console.log(`[MY SSO] len=${ssoFrame.length} head=${ssoFrame.subarray(0, 4).toString('hex')}`)
    console.log(`[MY SSO BODY HEX] ${ssoFrame.subarray(0, Math.min(ssoFrame.length, 200)).toString('hex').toUpperCase()}`)
  }

  // Encrypt SSO frame
  let encrypted: Buffer
  switch (encryptType) {
    case EncryptType.EncryptD2Key:
      encrypted = Buffer.from(teaEncrypt(ssoFrame, ctx.d2Key))
      break
    case EncryptType.EncryptEmpty:
      encrypted = Buffer.from(teaEncrypt(ssoFrame, EMPTY_KEY))
      break
    case EncryptType.NoEncrypt:
      encrypted = ssoFrame
      break
  }

  // Build service frame
  const parts: Buffer[] = []

  // Protocol version: 12 (int32)
  const verBuf = Buffer.alloc(4)
  verBuf.writeInt32BE(12)
  parts.push(verBuf)

  // Encrypt type (byte)
  parts.push(Buffer.from([encryptType]))

  // D2 token with int32 length prefix
  if (encryptType === EncryptType.EncryptD2Key && ctx.d2.length > 0) {
    parts.push(writeInt32Prefixed(ctx.d2))
  } else {
    const emptyD2 = Buffer.alloc(4)
    emptyD2.writeInt32BE(4)
    parts.push(emptyD2)
  }

  // Dummy byte
  parts.push(Buffer.from([0x00]))

  // UIN as decimal string with int32 length prefix
  parts.push(writeInt32PrefixedString(ctx.uin))

  // Encrypted body
  parts.push(encrypted)

  const innerPacket = Buffer.concat(parts)

  // Outer frame: int32 total length (including self)
  const frame = Buffer.alloc(4 + innerPacket.length)
  frame.writeInt32BE(4 + innerPacket.length)
  innerPacket.copy(frame, 4)

  return frame
}

/**
 * Parse incoming service packet (response format is unified regardless of protocol)
 * Response: [int32:length][int32:protocol][byte:encType][byte:dummy][int32+string:uin][body]
 */
export function parseServicePacket(frame: Buffer, d2Key: Buffer): SsoPacket | null {
  let offset = 0

  // Protocol version (int32)
  const version = frame.readInt32BE(offset); offset += 4

  // Encrypt type (byte)
  const encType = frame.readUInt8(offset); offset += 1

  // Dummy byte
  offset += 1

  // UIN string with int32 length prefix
  const uinLen = frame.readInt32BE(offset); offset += 4
  if (uinLen > 4) offset += uinLen - 4

  // Encrypted body (rest of the frame)
  const encBody = frame.subarray(offset)

  // Decrypt
  let ssoBody: Buffer
  try {
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
  } catch {
    return null
  }

  // Parse SSO frame (response always uses Protocol 12 format with full head)
  return parseSsoFrame12(ssoBody)
}

function parseSsoFrame13(data: Buffer, seq: number): SsoPacket | null {
  let offset = 0

  // Head length (int32, includes self)
  if (offset + 4 > data.length) return null
  const headLen = data.readInt32BE(offset); offset += 4
  const headEnd = offset + headLen - 4

  // Command with int32 prefix
  if (offset + 4 > headEnd) return null
  const cmdLen = data.readInt32BE(offset); offset += 4
  const cmd = data.subarray(offset, offset + cmdLen - 4).toString()

  // Skip to end of head
  offset = headEnd

  // Payload with int32 prefix
  if (offset + 4 > data.length) return null
  const payloadLen = data.readInt32BE(offset); offset += 4
  const payload = Buffer.from(data.subarray(offset, offset + payloadLen - 4))

  return { seq, cmd, payload }
}

function parseSsoFrame12(data: Buffer): SsoPacket | null {
  let offset = 0

  // Head with int32 length prefix (includes prefix)
  if (offset + 4 > data.length) return null
  const headLen = data.readInt32BE(offset); offset += 4
  const headEnd = offset + headLen - 4
  if (headEnd > data.length) return null

  // Parse head: seq(4) + retCode(4) + extra(int32 prefixed) + command(int32 prefixed) + ...
  const seq = data.readInt32BE(offset); offset += 4
  const retCode = data.readInt32BE(offset); offset += 4

  // Extra string (int32 prefix)
  if (offset + 4 > headEnd) return null
  const extraLen = data.readInt32BE(offset); offset += 4
  if (extraLen > 4) offset += extraLen - 4

  // Command string (int32 prefix)
  if (offset + 4 > headEnd) return null
  const cmdLen = data.readInt32BE(offset); offset += 4
  const cmd = data.subarray(offset, offset + cmdLen - 4).toString()
  offset += cmdLen - 4

  // Skip rest of head (msgCookie, dataFlag, reserveField)
  offset = headEnd

  // Body with int32 length prefix
  if (offset + 4 > data.length) return null
  const bodyLen = data.readInt32BE(offset); offset += 4
  const payload = Buffer.from(data.subarray(offset, offset + bodyLen - 4))

  return { seq, cmd, payload }
}
