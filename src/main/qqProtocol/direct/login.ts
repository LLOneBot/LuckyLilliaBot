/**
 * QR Code login flow for direct QQ protocol
 *
 * Packet layering for TransEmp:
 * Service Frame (4-byte length + TEA EncryptEmpty)
 *   └─ SSO Frame (Protocol 13, command "wtlogin.trans_emp")
 *       └─ WtLogin Frame (0x02 head, cmd 0x0812, 0x03 tail)
 *           └─ Code2D Body (TEA encrypted with TgtgtKey)
 *               └─ TransEmp TLVs
 */

import { DirectProtocolClient } from './client'
import { EncryptType } from './packet'
import { TlvWriter, tlvUnpack, writeBytes16, writeString16 } from './tlv'
import { teaEncrypt, teaDecrypt } from './tea'
import { AppInfo, DeviceInfo } from './appInfo'
import { randomBytes } from 'node:crypto'

export enum QrCodeState {
  Confirmed = 0,
  Expired = 17,
  WaitingForScan = 48,
  WaitingForConfirm = 53,
  Cancelled = 54,
}

export interface QrCodeResult {
  url: string
  image: Buffer
  sig: Buffer
  tgtgtKey: Buffer
}

export interface QrPollResult {
  state: QrCodeState
  uin?: string
  tgtgtKey?: Buffer
  noPicSig?: Buffer
  tempPassword?: Buffer
}

// Random TgtgtKey for initial TransEmp encryption
let currentTgtgtKey = randomBytes(16)

/**
 * Build WtLogin OICQ frame (0x02...0x03 wrapper)
 */
function buildWtLoginFrame(uin: number, command: number, body: Buffer): Buffer {
  // Frame: 0x02 + [length(2)] + version(2) + cmd(2) + seq(2) + uin(4) +
  //        retry(1) + encrypt(1) + reserved(1) + pubkeyVer(2) + pubkeyLen(2) + body + 0x03
  // Length field = version(2)+cmd(2)+seq(2)+uin(4)+retry(1)+encrypt(1)+reserved(1)+pubkeyVer(2)+pubkeyLen(2)+body
  //             = 17 + body.length
  const frameLength = 17 + body.length
  const parts: Buffer[] = []

  parts.push(Buffer.from([0x02]))  // start byte

  const header = Buffer.alloc(19)
  header.writeUInt16BE(frameLength, 0)   // length
  header.writeUInt16BE(8001, 2)          // version
  header.writeUInt16BE(command, 4)       // command
  header.writeUInt16BE(1, 6)             // sequence
  header.writeUInt32BE(uin, 8)           // uin
  header.writeUInt8(3, 12)              // retry flag
  header.writeUInt8(0x87, 13)           // encrypt method
  header.writeUInt8(0, 14)              // reserved
  header.writeUInt16BE(2, 15)           // public key version
  header.writeUInt16BE(0, 17)           // public key length = 0
  parts.push(header)

  parts.push(body)
  parts.push(Buffer.from([0x03]))  // end byte

  return Buffer.concat(parts)
}

/**
 * Build Code2D packet (wraps TransEmp body)
 */
function buildCode2dPacket(uin: number, subCommand: number, body: Buffer, tgtgtKey: Buffer): Buffer {
  // TEA encrypt the inner body with TgtgtKey
  const encrypted = Buffer.from(teaEncrypt(body, tgtgtKey))

  const parts: Buffer[] = []

  const header = Buffer.alloc(14)
  header.writeUInt16BE(0x0001, 0)     // head
  header.writeUInt32BE(uin, 2)        // uin
  header.writeUInt32BE(0x00000073, 6) // fixed value
  header.writeUInt32BE(0x00000000, 10) // zero
  parts.push(header)

  // Sub command (0x31 for fetch QR, 0x12 for poll)
  const cmdBuf = Buffer.alloc(2)
  cmdBuf.writeUInt16BE(subCommand)
  parts.push(cmdBuf)

  // Encrypted body with uint16 length prefix
  parts.push(writeBytes16(encrypted))

  return Buffer.concat(parts)
}

/**
 * Fetch QR code from server (TransEmp31)
 */
export async function fetchQrCode(client: DirectProtocolClient): Promise<QrCodeResult> {
  currentTgtgtKey = randomBytes(16)

  const tlv = new TlvWriter()

  // TLV 0x16: App info
  tlv.addTlv(0x16, buildTlv16(client))

  // TLV 0x1B: QR code params
  const tlv1B = Buffer.alloc(9)
  tlv1B.writeUInt16BE(0, 0)   // micro
  tlv1B.writeUInt8(0, 2)      // version
  tlv1B.writeUInt16BE(3, 3)   // size
  tlv1B.writeUInt8(4, 5)      // margin
  tlv1B.writeUInt8(72, 6)     // dpi
  tlv1B.writeUInt8(2, 7)      // eclevel
  tlv1B.writeUInt8(2, 8)      // hint
  tlv.addTlv(0x1B, tlv1B)

  // TLV 0x1D: Device capabilities
  const tlv1D = Buffer.alloc(7)
  tlv1D.writeUInt8(1, 0)
  tlv1D.writeUInt32BE(AppInfo.miscBitmap, 1)
  tlv1D.writeUInt16BE(0, 5)
  tlv.addTlv(0x1D, tlv1D)

  // TLV 0x33: GUID
  tlv.addTlv(0x33, client.getGuid())

  // TLV 0x35: SSO Version
  tlv.addTlvUint32(0x35, AppInfo.ssoVersion)

  // TLV 0x66: SSO Version (duplicate)
  tlv.addTlvUint32(0x66, AppInfo.ssoVersion)

  // Build inner body: header + TLVs
  const bodyParts: Buffer[] = []
  const bodyHeader = Buffer.alloc(14)
  bodyHeader.writeUInt16BE(0, 0)                // dummy
  bodyHeader.writeUInt32BE(AppInfo.appId, 2)    // appId
  bodyHeader.writeBigUInt64BE(0n, 6)            // uin = 0
  bodyParts.push(bodyHeader)
  bodyParts.push(Buffer.from([0x00, 0x00]))     // empty TGT (uint16 len = 0)
  bodyParts.push(Buffer.from([0x00]))           // empty byte
  bodyParts.push(Buffer.from([0x00, 0x00]))     // empty data (uint16 len = 0)
  bodyParts.push(tlv.build())                   // TLV collection
  const innerBody = Buffer.concat(bodyParts)

  // Wrap in Code2D → WtLogin
  const code2d = buildCode2dPacket(0, 0x31, innerBody, currentTgtgtKey)
  const wtLogin = buildWtLoginFrame(0, 0x0812, code2d)

  // Send via SSO (Protocol 13 Simple, EncryptEmpty)
  const resp = await client.sendCommand(
    'wtlogin.trans_emp',
    wtLogin,
    EncryptType.EncryptEmpty,
    10000,
  )

  return parseTransEmp31Response(resp.payload, currentTgtgtKey)
}

/**
 * Poll QR code status (TransEmp12)
 */
export async function pollQrCode(client: DirectProtocolClient, sig: Buffer): Promise<QrPollResult> {
  // Build inner body for poll (no TLVs)
  const bodyParts: Buffer[] = []
  const bodyHeader = Buffer.alloc(6)
  bodyHeader.writeUInt16BE(0, 0)                // dummy
  bodyHeader.writeUInt32BE(AppInfo.appId, 2)    // appId
  bodyParts.push(bodyHeader)
  bodyParts.push(writeBytes16(sig))             // QR sig with uint16 prefix
  bodyParts.push(Buffer.alloc(8))               // uin = 0 (uint64)
  bodyParts.push(Buffer.from([0x00, 0x00]))     // empty TGT
  bodyParts.push(Buffer.from([0x00]))           // empty byte
  bodyParts.push(Buffer.from([0x00, 0x00]))     // empty data
  bodyParts.push(Buffer.from([0x00, 0x00]))     // TLV count = 0
  const innerBody = Buffer.concat(bodyParts)

  const code2d = buildCode2dPacket(0, 0x12, innerBody, currentTgtgtKey)
  const wtLogin = buildWtLoginFrame(0, 0x0812, code2d)

  const resp = await client.sendCommand(
    'wtlogin.trans_emp',
    wtLogin,
    EncryptType.EncryptEmpty,
    10000,
  )

  return parseTransEmp12Response(resp.payload, currentTgtgtKey)
}

/**
 * Complete login after QR confirmation (wtlogin.login, command 0x09)
 */
export async function loginWithQrResult(
  client: DirectProtocolClient,
  qrResult: QrPollResult,
): Promise<void> {
  if (!qrResult.tempPassword || !qrResult.tgtgtKey || !qrResult.noPicSig || !qrResult.uin) {
    throw new Error('QR poll result incomplete')
  }

  const tlv = new TlvWriter()

  // TLV 0x106: Encrypted A1 (tempPassword)
  tlv.addTlv(0x106, qrResult.tempPassword)

  // TLV 0x144: Device info (encrypted with TgtgtKey)
  const innerTlv = new TlvWriter()
  innerTlv.addTlv(0x16E, Buffer.from(DeviceInfo.devName))
  innerTlv.addTlv(0x147, buildTlv147())
  innerTlv.addTlv(0x128, buildTlv128(client))
  innerTlv.addTlv(0x124, buildTlv124())
  const encrypted144 = Buffer.from(teaEncrypt(innerTlv.build(), qrResult.tgtgtKey))
  tlv.addTlv(0x144, encrypted144)

  // TLV 0x116: SDK info
  tlv.addTlv(0x116, buildTlv116())
  // TLV 0x142: Package name
  tlv.addTlv(0x142, writeString16(AppInfo.packageName))
  // TLV 0x145: GUID
  tlv.addTlv(0x145, client.getGuid())
  // TLV 0x018: Client version
  tlv.addTlv(0x018, buildTlv018())
  // TLV 0x141: Network info
  tlv.addTlv(0x141, buildTlv141())
  // TLV 0x177: SDK version
  tlv.addTlv(0x177, buildTlv177())
  // TLV 0x191: Key exchange flag
  tlv.addTlvUint8(0x191, 0)
  // TLV 0x100: Version/SigMap info
  tlv.addTlv(0x100, buildTlv100())
  // TLV 0x107: Captcha type
  const tlv107 = Buffer.alloc(4)
  tlv107.writeUInt16BE(1, 0)
  tlv107.writeUInt8(0x0D, 2)
  tlv107.writeUInt8(0, 3)
  tlv.addTlv(0x107, tlv107)
  // TLV 0x318: Empty
  tlv.addTlv(0x318, Buffer.alloc(0))
  // TLV 0x16A: NoPicSig
  tlv.addTlv(0x16A, qrResult.noPicSig)
  // TLV 0x166: Flag
  tlv.addTlvUint8(0x166, 0x05)

  // Command prefix 0x09
  const cmdPrefix = Buffer.alloc(2)
  cmdPrefix.writeUInt16BE(0x09)
  const loginBody = Buffer.concat([cmdPrefix, tlv.build()])

  // TEA encrypt login body with tgtgtKey
  const encryptedLogin = Buffer.from(teaEncrypt(loginBody, qrResult.tgtgtKey))

  const uin = Number(qrResult.uin)
  const wtLogin = buildWtLoginFrame(uin, 0x0810, encryptedLogin)

  const resp = await client.sendCommand(
    'wtlogin.login',
    wtLogin,
    EncryptType.EncryptEmpty,
    15000,
  )

  const session = parseLoginResponse(resp.payload, qrResult.tgtgtKey)
  if (!session) {
    throw new Error('Login failed: unable to parse session')
  }
  session.uin = qrResult.uin
  client.setSession(session)
}

// --- TLV builders ---

function buildTlv16(client: DirectProtocolClient): Buffer {
  const parts: Buffer[] = []
  const header = Buffer.alloc(8)
  header.writeUInt32BE(AppInfo.appId, 0)
  header.writeUInt32BE(AppInfo.subAppId, 4)
  parts.push(header)
  parts.push(client.getGuid())
  parts.push(writeString16(AppInfo.packageName))
  parts.push(writeString16(AppInfo.ptVersion))
  parts.push(writeString16(AppInfo.packageName))
  return Buffer.concat(parts)
}

function buildTlv147(): Buffer {
  const parts: Buffer[] = []
  const header = Buffer.alloc(4)
  header.writeUInt32BE(AppInfo.appId)
  parts.push(header)
  parts.push(writeString16(AppInfo.currentVersion))
  const { createHash } = require('node:crypto')
  parts.push(writeBytes16(createHash('md5').update(AppInfo.currentVersion).digest()))
  return Buffer.concat(parts)
}

function buildTlv128(client: DirectProtocolClient): Buffer {
  const parts: Buffer[] = []
  const header = Buffer.alloc(4)
  header.writeUInt16BE(0, 0)
  header.writeUInt8(1, 2)
  header.writeUInt8(0, 3)
  parts.push(header)
  parts.push(writeString16(DeviceInfo.devType))
  parts.push(writeBytes16(client.getGuid()))
  parts.push(writeString16(DeviceInfo.devName))
  return Buffer.concat(parts)
}

function buildTlv124(): Buffer {
  const parts: Buffer[] = []
  parts.push(writeString16(DeviceInfo.osVer))
  const network = Buffer.alloc(2)
  network.writeUInt16BE(1)
  parts.push(network)
  parts.push(writeString16(''))
  return Buffer.concat(parts)
}

function buildTlv116(): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeUInt8(0, 0)
  buf.writeUInt32BE(AppInfo.miscBitmap, 1)
  buf.writeUInt16BE(AppInfo.subSigMap, 5)
  buf.writeUInt8(1, 7)
  return Buffer.concat([buf, Buffer.alloc(4)])
}

function buildTlv018(): Buffer {
  const buf = Buffer.alloc(16)
  buf.writeUInt16BE(1, 0)
  buf.writeUInt32BE(1536, 2)
  buf.writeUInt32BE(AppInfo.appId, 6)
  buf.writeUInt32BE(0, 10)
  buf.writeUInt16BE(0, 14)
  return buf
}

function buildTlv141(): Buffer {
  const parts: Buffer[] = []
  const header = Buffer.alloc(4)
  header.writeUInt16BE(1, 0)
  header.writeUInt16BE(1, 2)
  parts.push(header)
  parts.push(writeString16(''))
  return Buffer.concat(parts)
}

function buildTlv177(): Buffer {
  const parts: Buffer[] = []
  const header = Buffer.alloc(5)
  header.writeUInt8(1, 0)
  header.writeUInt32BE(0, 1)
  parts.push(header)
  parts.push(writeString16(AppInfo.wtLoginSdk))
  return Buffer.concat(parts)
}

function buildTlv100(): Buffer {
  const buf = Buffer.alloc(20)
  buf.writeUInt16BE(1, 0)
  buf.writeUInt32BE(AppInfo.ssoVersion, 2)
  buf.writeUInt32BE(AppInfo.appId, 6)
  buf.writeUInt32BE(AppInfo.subAppId, 10)
  buf.writeUInt16BE(0, 14)
  buf.writeUInt32BE(AppInfo.mainSigMap, 16)
  return buf
}

// --- Response parsers ---

function parseTransEmp31Response(data: Buffer, tgtgtKey: Buffer): QrCodeResult {
  // The response payload is inside a WtLogin frame - strip outer 0x02...0x03
  let body = data
  if (body[0] === 0x02 && body[body.length - 1] === 0x03) {
    // Skip: 0x02(1) + length(2) + version(2) + cmd(2) + seq(2) + uin(4) = 13 bytes header
    body = body.subarray(13, body.length - 1)
  }

  // Decrypt Code2D response body with TgtgtKey
  // Skip: head(2) + uin(4) + fixed(4) + zero(4) + subcmd(2) + encrypted body (uint16 length prefix)
  let offset = 0
  offset += 2 + 4 + 4 + 4 + 2 // 16 bytes of code2d header

  const encLen = body.readUInt16BE(offset); offset += 2
  const encBody = body.subarray(offset, offset + encLen)

  let decrypted: Buffer
  try {
    decrypted = Buffer.from(teaDecrypt(encBody, tgtgtKey))
  } catch {
    throw new Error('Failed to decrypt TransEmp31 response')
  }

  // Parse decrypted body
  let dOffset = 0
  // dummy(2) + appId(4)
  dOffset += 2 + 4
  const retCode = decrypted.readUInt8(dOffset); dOffset += 1

  if (retCode !== 0) {
    throw new Error(`TransEmp31 failed with code ${retCode}`)
  }

  // sig (int16 length prefix)
  const sigLen = decrypted.readUInt16BE(dOffset); dOffset += 2
  const sig = Buffer.from(decrypted.subarray(dOffset, dOffset + sigLen)); dOffset += sigLen

  // TLV collection
  const tlvData = decrypted.subarray(dOffset)
  const tlvs = tlvUnpack(tlvData)

  // Extract QR URL from TLV 0xD1
  let url = ''
  const tlvD1 = tlvs.get(0xD1)
  if (tlvD1) {
    const urlMatch = tlvD1.toString('utf-8').match(/https?:\/\/[^\x00]+/)
    if (urlMatch) url = urlMatch[0]
  }

  // Extract QR image from TLV 0x17
  const image = tlvs.get(0x17) || Buffer.alloc(0)

  return { url, image, sig, tgtgtKey }
}

function parseTransEmp12Response(data: Buffer, tgtgtKey: Buffer): QrPollResult {
  // Strip WtLogin frame
  let body = data
  if (body[0] === 0x02 && body[body.length - 1] === 0x03) {
    body = body.subarray(13, body.length - 1)
  }

  // Decrypt Code2D response
  let offset = 0
  offset += 2 + 4 + 4 + 4 + 2 // code2d header (16 bytes)
  const encLen = body.readUInt16BE(offset); offset += 2
  const encBody = body.subarray(offset, offset + encLen)

  let decrypted: Buffer
  try {
    decrypted = Buffer.from(teaDecrypt(encBody, tgtgtKey))
  } catch {
    throw new Error('Failed to decrypt TransEmp12 response')
  }

  let dOffset = 0
  dOffset += 2 + 4 // dummy + appId
  const state = decrypted.readUInt8(dOffset) as QrCodeState; dOffset += 1

  if (state !== QrCodeState.Confirmed) {
    return { state }
  }

  // UIN (8 bytes)
  const uin = decrypted.readBigUInt64BE(dOffset).toString(); dOffset += 8
  // Retry count (4 bytes)
  dOffset += 4

  // TLV collection
  const tlvData = decrypted.subarray(dOffset)
  const tlvs = tlvUnpack(tlvData)

  return {
    state,
    uin,
    tgtgtKey: tlvs.get(0x1E),
    noPicSig: tlvs.get(0x19),
    tempPassword: tlvs.get(0x18),
  }
}

function parseLoginResponse(data: Buffer, tgtgtKey: Buffer): import('./client').SessionInfo | null {
  // Strip WtLogin frame
  let body = data
  if (body[0] === 0x02 && body[body.length - 1] === 0x03) {
    body = body.subarray(13, body.length - 1)
  }

  // Decrypt with tgtgtKey
  let decrypted: Buffer
  try {
    decrypted = Buffer.from(teaDecrypt(body, tgtgtKey))
  } catch {
    throw new Error('Failed to decrypt login response')
  }

  // Parse: cmd(2) + state(1)
  let offset = 0
  offset += 2 // command
  const state = decrypted.readUInt8(offset); offset += 1

  if (state !== 0) {
    const tlvData = decrypted.subarray(offset)
    const tlvs = tlvUnpack(tlvData)
    const errBuf = tlvs.get(0x146)
    if (errBuf && errBuf.length > 8) {
      const errCode = errBuf.readUInt32BE(0)
      const titleLen = errBuf.readUInt16BE(4)
      const title = errBuf.subarray(6, 6 + titleLen).toString()
      const msgLen = errBuf.readUInt16BE(6 + titleLen)
      const msg = errBuf.subarray(8 + titleLen, 8 + titleLen + msgLen).toString()
      throw new Error(`Login failed (${errCode}): ${title} - ${msg}`)
    }
    throw new Error(`Login failed with state ${state}`)
  }

  const tlvData = decrypted.subarray(offset)
  const tlvs = tlvUnpack(tlvData)

  let d2 = tlvs.get(0x143) || Buffer.alloc(0)
  let d2Key = tlvs.get(0x305) || Buffer.alloc(16)

  // Nested TLV 0x119 (encrypted with tgtgtKey)
  const tlv119 = tlvs.get(0x119)
  if (tlv119) {
    const nested119 = Buffer.from(teaDecrypt(tlv119, tgtgtKey))
    const nestedTlvs = tlvUnpack(nested119)
    d2 = nestedTlvs.get(0x143) || d2
    d2Key = nestedTlvs.get(0x305) || d2Key
  }

  let uid = ''
  const uidBuf = tlvs.get(0x543)
  if (uidBuf) uid = uidBuf.toString('utf-8').replace(/\x00/g, '')

  return {
    uin: '',
    uid,
    d2,
    d2Key,
    tgt: tlvs.get(0x10A) || Buffer.alloc(0),
    a2: tlvs.get(0x10A) || Buffer.alloc(0),
    a2Key: tlvs.get(0x10D) || Buffer.alloc(16),
    sKey: tlvs.get(0x120) || Buffer.alloc(0),
  }
}

export enum QrCodeState {
  Confirmed = 0,
  Expired = 17,
  WaitingForScan = 48,
  WaitingForConfirm = 53,
  Cancelled = 54,
}

export interface QrCodeResult {
  url: string
  image: Buffer
  sig: Buffer
}

export interface QrPollResult {
  state: QrCodeState
  uin?: string
  tgtgtKey?: Buffer
  noPicSig?: Buffer
  tempPassword?: Buffer
}

/**
 * Build the outer WtLogin packet frame
 */
function buildWtLoginPacket(cmd: number, uin: bigint, body: Buffer): Buffer {
  const parts: Buffer[] = []

  // Header
  const header = Buffer.alloc(15)
  header.writeUInt16BE(8001, 0)    // version
  header.writeUInt16BE(cmd, 2)     // command (0x0812 for TransEmp, 0x0810 for login)
  header.writeUInt16BE(1, 4)       // seq placeholder
  header.writeUInt32BE(Number(uin & 0xFFFFFFFFn), 6) // uin lower 32
  header.writeUInt8(3, 10)         // retry flag
  header.writeUInt8(0x87, 11)      // encrypt method flag
  header.writeUInt8(0, 12)         // reserved
  header.writeUInt16BE(0, 13)      // public key index
  parts.push(header)

  // Encrypt key (16 zero bytes for empty encrypt)
  parts.push(Buffer.alloc(2))  // key length = 0 when empty encrypt

  // Body
  parts.push(body)

  // Tail
  parts.push(Buffer.from([0x03]))

  const inner = Buffer.concat(parts)

  // Prefix with length
  const frame = Buffer.alloc(4 + inner.length)
  frame.writeUInt32BE(inner.length + 4, 0)
  inner.copy(frame, 4)

  return frame
}

