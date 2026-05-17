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
  uid: string
  d2: Buffer
  d2Key: Buffer
  tgt: Buffer
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

function buildSsoHead12(seq: number, cmd: string, ctx: PacketContext, signResult?: SignResult | null): Buffer {
  const parts: Buffer[] = []

  const seqBuf = Buffer.alloc(4)
  seqBuf.writeInt32BE(seq)
  parts.push(seqBuf)

  const subAppBuf = Buffer.alloc(4)
  subAppBuf.writeInt32BE(ctx.subAppId)
  parts.push(subAppBuf)

  const fixed2052 = Buffer.alloc(4)
  fixed2052.writeInt32BE(2052)
  parts.push(fixed2052)

  parts.push(FIXED_HEADER)

  parts.push(writeInt32Prefixed(ctx.tgt))

  parts.push(writeInt32PrefixedString(cmd))

  parts.push(writeInt32Prefixed(Buffer.alloc(0)))

  parts.push(writeInt32PrefixedString(ctx.guid.toString('hex')))

  parts.push(writeInt32Prefixed(Buffer.alloc(0)))

  parts.push(writeInt16PrefixedString(ctx.buildVer))

  const reservedField = buildSsoReservedField(ctx.uid || undefined, signResult)
  parts.push(writeInt32Prefixed(reservedField))

  const head = Buffer.concat(parts)

  return writeInt32Prefixed(head)
}

function buildSsoHead13(cmd: string, ctx: PacketContext): Buffer {
  const parts: Buffer[] = []
  parts.push(writeInt32PrefixedString(cmd))
  parts.push(writeInt32Prefixed(Buffer.alloc(0)))
  const reservedField = buildSsoReservedField(ctx.uid || undefined)
  parts.push(writeInt32Prefixed(reservedField))
  const head = Buffer.concat(parts)
  return writeInt32Prefixed(head)
}

function buildSsoFrame13(cmd: string, ctx: PacketContext, payload: Buffer): Buffer {
  const head = buildSsoHead13(cmd, ctx)
  const payloadWithLen = writeInt32Prefixed(payload)
  return Buffer.concat([head, payloadWithLen])
}

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

  const verBuf = Buffer.alloc(4)
  verBuf.writeInt32BE(13)
  parts.push(verBuf)

  parts.push(Buffer.from([encryptType]))

  // Protocol 13 includes seq in service frame
  const seqBuf = Buffer.alloc(4)
  seqBuf.writeInt32BE(seq)
  parts.push(seqBuf)

  parts.push(Buffer.from([0x00]))

  parts.push(writeInt32PrefixedString(ctx.uin))

  parts.push(encrypted)

  const innerPacket = Buffer.concat(parts)

  const frame = Buffer.alloc(4 + innerPacket.length)
  frame.writeInt32BE(4 + innerPacket.length)
  innerPacket.copy(frame, 4)

  return frame
}

function buildSsoFrame12(seq: number, cmd: string, ctx: PacketContext, payload: Buffer, signResult?: SignResult | null): Buffer {
  const head = buildSsoHead12(seq, cmd, ctx, signResult)
  const payloadWithLen = writeInt32Prefixed(payload)
  return Buffer.concat([head, payloadWithLen])
}

export function buildServicePacket(
  seq: number,
  cmd: string,
  ctx: PacketContext,
  payload: Buffer,
  encryptType: EncryptType = EncryptType.EncryptD2Key,
  signResult?: SignResult | null,
): Buffer {
  const ssoFrame = buildSsoFrame12(seq, cmd, ctx, payload, signResult)

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

  const parts: Buffer[] = []

  const verBuf = Buffer.alloc(4)
  verBuf.writeInt32BE(12)
  parts.push(verBuf)

  parts.push(Buffer.from([encryptType]))

  if (encryptType === EncryptType.EncryptD2Key && ctx.d2.length > 0) {
    parts.push(writeInt32Prefixed(ctx.d2))
  } else {
    const emptyD2 = Buffer.alloc(4)
    emptyD2.writeInt32BE(4)
    parts.push(emptyD2)
  }

  parts.push(Buffer.from([0x00]))

  parts.push(writeInt32PrefixedString(ctx.uin))

  parts.push(encrypted)

  const innerPacket = Buffer.concat(parts)

  const frame = Buffer.alloc(4 + innerPacket.length)
  frame.writeInt32BE(4 + innerPacket.length)
  innerPacket.copy(frame, 4)

  return frame
}

export function parseServicePacket(frame: Buffer, d2Key: Buffer): SsoPacket | null {
  let offset = 0

  const version = frame.readInt32BE(offset); offset += 4

  const encType = frame.readUInt8(offset); offset += 1

  offset += 1

  const uinLen = frame.readInt32BE(offset); offset += 4
  if (uinLen > 4) offset += uinLen - 4

  const encBody = frame.subarray(offset)

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

  // Response always uses Protocol 12 format with full head
  return parseSsoFrame12(ssoBody)
}

function parseSsoFrame13(data: Buffer, seq: number): SsoPacket | null {
  let offset = 0

  if (offset + 4 > data.length) return null
  const headLen = data.readInt32BE(offset); offset += 4
  const headEnd = offset + headLen - 4

  if (offset + 4 > headEnd) return null
  const cmdLen = data.readInt32BE(offset); offset += 4
  const cmd = data.subarray(offset, offset + cmdLen - 4).toString()

  offset = headEnd

  if (offset + 4 > data.length) return null
  const payloadLen = data.readInt32BE(offset); offset += 4
  const payload = Buffer.from(data.subarray(offset, offset + payloadLen - 4))

  return { seq, cmd, payload }
}

function parseSsoFrame12(data: Buffer): SsoPacket | null {
  let offset = 0

  if (offset + 4 > data.length) return null
  const headLen = data.readInt32BE(offset); offset += 4
  const headEnd = offset + headLen - 4
  if (headEnd > data.length) return null

  const seq = data.readInt32BE(offset); offset += 4
  const retCode = data.readInt32BE(offset); offset += 4

  if (offset + 4 > headEnd) return null
  const extraLen = data.readInt32BE(offset); offset += 4
  if (extraLen > 4) offset += extraLen - 4

  if (offset + 4 > headEnd) return null
  const cmdLen = data.readInt32BE(offset); offset += 4
  const cmd = data.subarray(offset, offset + cmdLen - 4).toString()
  offset += cmdLen - 4

  offset = headEnd

  if (offset + 4 > data.length) return null
  const bodyLen = data.readInt32BE(offset); offset += 4
  const payload = Buffer.from(data.subarray(offset, offset + bodyLen - 4))

  return { seq, cmd, payload }
}
