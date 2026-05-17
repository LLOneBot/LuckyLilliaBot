/**
 * QR Code login flow for direct QQ protocol
 * Implements TransEmp31 (fetch QR) and TransEmp12 (poll status)
 * and wtlogin.login (command 0x09) for session establishment
 */

import { DirectProtocolClient } from './client'
import { EncryptType } from './packet'
import { TlvWriter, tlvUnpack, writeBytes16, writeString16 } from './tlv'
import { teaEncrypt, teaDecrypt } from './tea'
import { AppInfo, DeviceInfo } from './appInfo'
import { randomBytes, createHash } from 'node:crypto'

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

/**
 * Fetch QR code from server (TransEmp31)
 */
export async function fetchQrCode(client: DirectProtocolClient): Promise<QrCodeResult> {
  const tlv = new TlvWriter()

  // TLV 0x16: App info
  const tlv16Data = buildTlv16(client)
  tlv.addTlv(0x16, tlv16Data)

  // TLV 0x1B: QR code params (size=3, margin=4, dpi=72, eclevel=2, hint=2)
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

  const tlvBody = tlv.build()

  // Build TransEmp31 body
  const bodyParts: Buffer[] = []
  const cmdHeader = Buffer.alloc(14)
  cmdHeader.writeUInt16BE(0, 0)               // dummy
  cmdHeader.writeUInt32BE(AppInfo.appId, 2)   // appId
  cmdHeader.writeBigUInt64BE(0n, 6)           // uin = 0
  bodyParts.push(cmdHeader)

  // Empty TGT (uint16 length + data)
  bodyParts.push(Buffer.from([0x00, 0x00]))
  // Empty byte
  bodyParts.push(Buffer.from([0x00]))
  // Empty data with int16 prefix
  bodyParts.push(Buffer.from([0x00, 0x00]))
  // TLVs
  bodyParts.push(tlvBody)

  const body = Buffer.concat(bodyParts)
  const wtPacket = buildWtLoginPacket(0x0812, 0n, body)

  const resp = await client.sendCommand(
    'wtlogin.trans_emp',
    wtPacket,
    EncryptType.EncryptEmpty,
    10000,
  )

  return parseTransEmp31Response(resp.payload)
}

/**
 * Poll QR code status (TransEmp12)
 */
export async function pollQrCode(client: DirectProtocolClient, sig: Buffer): Promise<QrPollResult> {
  const bodyParts: Buffer[] = []
  const cmdHeader = Buffer.alloc(6)
  cmdHeader.writeUInt16BE(0, 0)               // dummy
  cmdHeader.writeUInt32BE(AppInfo.appId, 2)   // appId
  bodyParts.push(cmdHeader)

  // QR sig with int16 length prefix
  bodyParts.push(writeBytes16(sig))

  // UIN = 0
  const uinBuf = Buffer.alloc(8)
  bodyParts.push(uinBuf)

  // Empty TGT
  bodyParts.push(Buffer.from([0x00, 0x00]))
  // Empty byte
  bodyParts.push(Buffer.from([0x00]))
  // Empty data
  bodyParts.push(Buffer.from([0x00, 0x00]))
  // TLV count = 0
  bodyParts.push(Buffer.from([0x00, 0x00]))

  const body = Buffer.concat(bodyParts)
  const wtPacket = buildWtLoginPacket(0x0812, 0n, body)

  const resp = await client.sendCommand(
    'wtlogin.trans_emp',
    wtPacket,
    EncryptType.EncryptEmpty,
    10000,
  )

  return parseTransEmp12Response(resp.payload)
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

  // TLV 0x106: Encrypted A1 (tempPassword from QR confirmation)
  tlv.addTlv(0x106, qrResult.tempPassword)

  // TLV 0x144: Device info (encrypted with TgtgtKey)
  const innerTlv = new TlvWriter()
  innerTlv.addTlv(0x16E, Buffer.from(DeviceInfo.devName))
  innerTlv.addTlv(0x147, buildTlv147())
  innerTlv.addTlv(0x128, buildTlv128(client))
  innerTlv.addTlv(0x124, buildTlv124())
  const innerData = innerTlv.build()
  const encrypted144 = Buffer.from(teaEncrypt(innerData, qrResult.tgtgtKey))
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
  tlv107.writeUInt16BE(1, 0)    // pic_type
  tlv107.writeUInt8(0x0D, 2)    // captcha_type
  tlv107.writeUInt8(0, 3)       // reserved
  tlv.addTlv(0x107, tlv107)

  // TLV 0x318: Empty
  tlv.addTlv(0x318, Buffer.alloc(0))

  // TLV 0x16A: NoPicSig
  tlv.addTlv(0x16A, qrResult.noPicSig)

  // TLV 0x166: Flag
  tlv.addTlvUint8(0x166, 0x05)

  // TLV 0x521: Client info
  const tlv521 = Buffer.alloc(6)
  tlv521.writeUInt32BE(0, 0)
  tlv521.writeUInt16BE(0, 4)
  tlv.addTlv(0x521, Buffer.concat([tlv521, writeString16('basicim')]))

  const tlvBody = tlv.build()

  // Build wtlogin.login body with command 0x09
  const cmdPrefix = Buffer.alloc(2)
  cmdPrefix.writeUInt16BE(0x09)
  const body = Buffer.concat([cmdPrefix, tlvBody])

  const uin = BigInt(qrResult.uin)
  const wtPacket = buildWtLoginPacket(0x0810, uin, body)

  const resp = await client.sendCommand(
    'wtlogin.login',
    wtPacket,
    EncryptType.EncryptEmpty,
    15000,
  )

  const session = parseLoginResponse(resp.payload, qrResult.tgtgtKey)
  if (!session) {
    throw new Error('Login failed: unable to parse session')
  }
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
  parts.push(writeBytes16(createHash('md5').update(AppInfo.currentVersion).digest()))
  return Buffer.concat(parts)
}

function buildTlv128(client: DirectProtocolClient): Buffer {
  const parts: Buffer[] = []
  const header = Buffer.alloc(4)
  header.writeUInt16BE(0, 0)  // new install
  header.writeUInt8(1, 2)     // read GUID
  header.writeUInt8(0, 3)     // GUID changes
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
  network.writeUInt16BE(1) // wifi
  parts.push(network)
  parts.push(writeString16(''))  // APN name
  return Buffer.concat(parts)
}

function buildTlv116(): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeUInt8(0, 0)                         // ver
  buf.writeUInt32BE(AppInfo.miscBitmap, 1)     // miscBitmap
  buf.writeUInt16BE(AppInfo.subSigMap, 5)      // subSigMap
  buf.writeUInt8(1, 7)                         // sizeOf(appIdList)
  return Buffer.concat([buf, Buffer.alloc(4)]) // + appIdList (empty uint32)
}

function buildTlv018(): Buffer {
  const buf = Buffer.alloc(16)
  buf.writeUInt16BE(1, 0)                      // ping version
  buf.writeUInt32BE(1536, 2)                   // sso version
  buf.writeUInt32BE(AppInfo.appId, 6)          // appId
  buf.writeUInt32BE(0, 10)                     // app client version
  buf.writeUInt16BE(0, 14)                     // unknown
  return buf
}

function buildTlv141(): Buffer {
  const parts: Buffer[] = []
  const header = Buffer.alloc(4)
  header.writeUInt16BE(1, 0)   // version
  header.writeUInt16BE(1, 2)   // network type (wifi)
  parts.push(header)
  parts.push(writeString16(''))  // APN
  return Buffer.concat(parts)
}

function buildTlv177(): Buffer {
  const parts: Buffer[] = []
  const header = Buffer.alloc(5)
  header.writeUInt8(1, 0)
  header.writeUInt32BE(0, 1)  // build time
  parts.push(header)
  parts.push(writeString16(AppInfo.wtLoginSdk))
  return Buffer.concat(parts)
}

function buildTlv100(): Buffer {
  const buf = Buffer.alloc(16)
  buf.writeUInt16BE(1, 0)                      // db version
  buf.writeUInt32BE(AppInfo.ssoVersion, 2)     // sso version
  buf.writeUInt32BE(AppInfo.appId, 6)          // appId
  buf.writeUInt32BE(AppInfo.subAppId, 10)      // subAppId
  buf.writeUInt16BE(0, 14)                     // client version
  return Buffer.concat([buf, (() => {
    const sig = Buffer.alloc(4)
    sig.writeUInt32BE(AppInfo.mainSigMap)
    return sig
  })()])
}

// --- Response parsers ---

function parseTransEmp31Response(data: Buffer): QrCodeResult {
  let offset = 0
  // Skip WtLogin outer frame if present
  if (data.length > 4 && data.readUInt32BE(0) === data.length) {
    offset = 4
  }

  // Skip header bytes to find TLV section
  // dummy(2) + appId(4) + retCode(1)
  offset += 2 + 4
  const retCode = data.readUInt8(offset); offset += 1

  if (retCode !== 0) {
    throw new Error(`TransEmp31 failed with code ${retCode}`)
  }

  // sig (int16 length prefix)
  const sigLen = data.readUInt16BE(offset); offset += 2
  const sig = Buffer.from(data.subarray(offset, offset + sigLen)); offset += sigLen

  // TLV collection
  const tlvData = data.subarray(offset)
  const tlvs = tlvUnpack(tlvData)

  // Extract QR URL from TLV 0xD1 (protobuf, simplified parsing)
  let url = ''
  const tlvD1 = tlvs.get(0xD1)
  if (tlvD1) {
    // Simple extraction - look for URL string pattern
    const urlMatch = tlvD1.toString('utf-8').match(/https?:\/\/[^\x00]+/)
    if (urlMatch) url = urlMatch[0]
  }

  // Extract QR image from TLV 0x17
  const image = tlvs.get(0x17) || Buffer.alloc(0)

  return { url, image, sig }
}

function parseTransEmp12Response(data: Buffer): QrPollResult {
  let offset = 0
  if (data.length > 4 && data.readUInt32BE(0) === data.length) {
    offset = 4
  }

  // dummy(2) + appId(4)
  offset += 2 + 4
  const state = data.readUInt8(offset) as QrCodeState; offset += 1

  if (state !== QrCodeState.Confirmed) {
    return { state }
  }

  // UIN (8 bytes)
  const uin = data.readBigUInt64BE(offset).toString(); offset += 8

  // Retry count (4 bytes)
  offset += 4

  // TLV collection
  const tlvData = data.subarray(offset)
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
  let offset = 0
  if (data.length > 4 && data.readUInt32BE(0) === data.length) {
    offset = 4
  }

  // Skip WtLogin response header
  // cmd(2) + internalCmd(2) + state(1)
  offset += 2 + 2
  const state = data.readUInt8(offset); offset += 1

  if (state !== 0) {
    // Try to find error TLV
    const tlvData = data.subarray(offset)
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

  const tlvData = data.subarray(offset)
  const tlvs = tlvUnpack(tlvData)

  // D2 and D2Key may be directly in response
  let d2 = tlvs.get(0x143) || Buffer.alloc(0)
  let d2Key = tlvs.get(0x305) || Buffer.alloc(16)

  // Or nested inside TLV 0x119 (encrypted with tgtgtKey)
  const tlv119 = tlvs.get(0x119)
  if (tlv119) {
    const decrypted = Buffer.from(teaDecrypt(tlv119, tgtgtKey))
    const nested = tlvUnpack(decrypted)
    d2 = nested.get(0x143) || d2
    d2Key = nested.get(0x305) || d2Key
  }

  const a2 = tlvs.get(0x10A) || Buffer.alloc(0)
  const tgt = tlvs.get(0x10A) || Buffer.alloc(0) // A2 is often used as TGT
  const sKey = tlvs.get(0x120) || Buffer.alloc(0)

  // Extract UID from TLV 0x543
  let uid = ''
  const uidBuf = tlvs.get(0x543)
  if (uidBuf) {
    uid = uidBuf.toString('utf-8').replace(/\x00/g, '')
  }

  // Extract nickname from TLV 0x11A
  const infoBuf = tlvs.get(0x11A)
  let nick = ''
  if (infoBuf && infoBuf.length > 5) {
    const nickLen = infoBuf.readUInt16BE(3)
    nick = infoBuf.subarray(5, 5 + nickLen).toString('utf-8')
  }

  return {
    uin: '', // Will be set from QR result
    uid,
    d2,
    d2Key,
    tgt,
    a2,
    a2Key: Buffer.alloc(16),
    sKey,
  }
}
