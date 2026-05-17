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
  tgtgtKey: Buffer
}

export interface QrPollResult {
  state: QrCodeState
  uin?: string
  tgtgtKey?: Buffer
  noPicSig?: Buffer
  tempPassword?: Buffer
}

// Zero buffer for encrypt head (tanebi uses zeros, not random)
const BUF16 = Buffer.alloc(16)
const BUF3 = Buffer.alloc(3)
const BUF21 = Buffer.alloc(21)

/**
 * Build WtLogin packet (matching tanebi's WtLoginLogic.buildWtLoginPacket)
 */
function buildWtLoginFrame(uin: number, command: 'wtlogin.login' | 'wtlogin.trans_emp', body: Buffer, ecdhPublicKey: Buffer, shareKey: Buffer): Buffer {
  const encrypted = Buffer.from(teaEncrypt(body, shareKey))

  const cmdId = command === 'wtlogin.login' ? 2064 : 2066

  const parts: Buffer[] = []
  const header = Buffer.alloc(2 + 2 + 2 + 4 + 1 + 1 + 4 + 1 + 2 + 2 + 4 + 1 + 1 + 16 + 2 + 2 + ecdhPublicKey.length)
  let off = 0

  // WtLogin header
  header.writeUInt16BE(8001, off); off += 2              // version
  header.writeUInt16BE(cmdId, off); off += 2             // commandId
  header.writeUInt16BE(0, off); off += 2                 // sequence
  header.writeUInt32BE(uin, off); off += 4               // uin
  header.writeUInt8(3, off); off += 1                    // extVer
  header.writeUInt8(135, off); off += 1                  // cmdVer (0x87)
  header.writeUInt32BE(0, off); off += 4                 // unknown constant
  header.writeUInt8(19, off); off += 1                   // pubId (0x13)
  header.writeUInt16BE(0, off); off += 2                 // insId
  header.writeUInt16BE(AppInfo.appClientVersion, off); off += 2  // AppClientVersion
  header.writeUInt32BE(0, off); off += 4                 // retryTime

  // Encrypt head
  header.writeUInt8(1, off); off += 1
  header.writeUInt8(1, off); off += 1
  BUF16.copy(header, off); off += 16                     // 16 zero bytes (not random)
  header.writeUInt16BE(0x102, off); off += 2
  header.writeUInt16BE(ecdhPublicKey.length, off); off += 2
  ecdhPublicKey.copy(header, off); off += ecdhPublicKey.length

  // Combine: header + encrypted + 0x03
  const innerBody = Buffer.concat([header.subarray(0, off), encrypted, Buffer.from([0x03])])

  // Outer frame: 0x02 + length(uint16, includes self + 1 for 0x03) + innerBody
  const frame = Buffer.alloc(1 + 2 + innerBody.length)
  frame.writeUInt8(0x02, 0)
  frame.writeUInt16BE(innerBody.length + 3, 1)  // length includes self(2) + addition(1)
  innerBody.copy(frame, 3)

  return frame
}

/**
 * Build Code2D/TransEmp body (matching tanebi's WtLoginLogic.buildTransEmpBody)
 */
function buildCode2dPacket(subCommand: number, tlv: Buffer): Buffer {
  const timestamp = Math.floor(Date.now() / 1000)

  // requestBody
  const requestBody = Buffer.alloc(4 + 1 + 2 + 2 + 21 + 1 + 4 + 2 + 4 + 8 + tlv.length + 1)
  let off = 0

  // timestamp (uint32)
  requestBody.writeUInt32BE(timestamp, off); off += 4
  // byte: 0x02
  requestBody.writeUInt8(0x02, off); off += 1
  // length (uint16) = 46 + tlv.length (hard-coded per tanebi)
  requestBody.writeUInt16BE(46 + tlv.length, off); off += 2
  // subCommand (uint16)
  requestBody.writeUInt16BE(subCommand, off); off += 2
  // 21 zero bytes
  BUF21.copy(requestBody, off); off += 21
  // flag: 0x03
  requestBody.writeUInt8(0x03, off); off += 1
  // version code (int32 = 0x32 = 50)
  requestBody.writeInt32BE(0x32, off); off += 4
  // close (int16 = 0)
  requestBody.writeInt16BE(0, off); off += 2
  // trans_emp sequence (uint32 = 0)
  requestBody.writeUInt32BE(0, off); off += 4
  // dummy uin (uint64 = 0)
  requestBody.writeBigUInt64BE(0n, off); off += 8
  // TLV data
  tlv.copy(requestBody, off); off += tlv.length
  // end marker: 0x03
  requestBody.writeUInt8(0x03, off); off += 1

  // Outer wrapper
  const outerSize = 1 + 2 + 4 + 4 + 3 + requestBody.length
  const outer = Buffer.alloc(outerSize)
  let oOff = 0

  outer.writeUInt8(0, oOff); oOff += 1                    // encrypt flag: 0
  outer.writeUInt16BE(requestBody.length, oOff); oOff += 2 // requestBody length
  outer.writeUInt32BE(AppInfo.appId, oOff); oOff += 4      // AppId
  outer.writeUInt32BE(0x72, oOff); oOff += 4               // Role
  BUF3.copy(outer, oOff); oOff += 3                        // St(uint16=0) + rollback(uint8=0)
  requestBody.copy(outer, oOff)

  return outer
}

/**
 * Fetch QR code from server (TransEmp31)
 */
export async function fetchQrCode(client: DirectProtocolClient): Promise<QrCodeResult> {

  const tlv = new TlvWriter()

  // TLV 0x16: App info (field0 + appId + appIdQrCode + guid + packageName + ptVersion + packageName2)
  tlv.addTlv(0x16, buildTlv16(client))

  // TLV 0x1B: QR code params (all uint32 except last uint16)
  const tlv1B = Buffer.alloc(30) // 7*uint32 + 1*uint16
  tlv1B.writeUInt32BE(0, 0)    // micro
  tlv1B.writeUInt32BE(0, 4)    // version
  tlv1B.writeUInt32BE(3, 8)    // size
  tlv1B.writeUInt32BE(4, 12)   // margin
  tlv1B.writeUInt32BE(72, 16)  // dpi
  tlv1B.writeUInt32BE(2, 20)   // ecLevel
  tlv1B.writeUInt32BE(2, 24)   // hint
  tlv1B.writeUInt16BE(0, 28)   // field7
  tlv.addTlv(0x1B, tlv1B)

  // TLV 0x1D: Device capabilities (uint8 + uint32 + uint32 + uint8)
  const tlv1D = Buffer.alloc(10)
  tlv1D.writeUInt8(1, 0)
  tlv1D.writeUInt32BE(AppInfo.mainSigMap, 1)
  tlv1D.writeUInt32BE(0, 5)
  tlv1D.writeUInt8(0, 9)
  tlv.addTlv(0x1D, tlv1D)

  // TLV 0x33: GUID
  tlv.addTlv(0x33, client.getGuid())

  // TLV 0x35: SSO Version
  tlv.addTlvUint32(0x35, AppInfo.ssoVersion)

  // TLV 0x66: SSO Version (duplicate)
  tlv.addTlvUint32(0x66, AppInfo.ssoVersion)

  // TLV 0xD1: QrExtInfo protobuf (DevInfo + GenInfo)
  tlv.addTlv(0xD1, buildTlvD1())

  // Build TransEmp31 body (matching tanebi's TransEmp31 structure)
  const bodyParts: Buffer[] = []
  // uint32: AppId
  const appIdBuf = Buffer.alloc(4)
  appIdBuf.writeUInt32BE(AppInfo.appId)
  bodyParts.push(appIdBuf)
  // uint64: uin = 0
  bodyParts.push(Buffer.alloc(8))
  // bytes: empty TGT (no prefix, 0 bytes)
  // uint8: field4 = 0
  bodyParts.push(Buffer.from([0x00]))
  // uint16: field5 = 0
  bodyParts.push(Buffer.from([0x00, 0x00]))
  // TLV collection
  bodyParts.push(tlv.build())
  const innerBody = Buffer.concat(bodyParts)

  // Build Code2D then wrap in WtLogin frame
  const code2d = buildCode2dPacket(0x31, innerBody)
  const wtLogin = buildWtLoginFrame(0, 'wtlogin.trans_emp', code2d, client.getEcdhPublicKey(), client.getEcdhShareKey())

  // Send via SSO (Protocol 13 Simple, EncryptEmpty)
  const resp = await client.sendCommand(
    'wtlogin.trans_emp',
    wtLogin,
    EncryptType.EncryptEmpty,
    10000,
  )

  return parseTransEmp31Response(resp.payload, client.getEcdhShareKey())
}

/**
 * Poll QR code status (TransEmp12)
 */
export async function pollQrCode(client: DirectProtocolClient, sig: Buffer): Promise<QrPollResult> {
  // TransEmp12 body: appId(4) + sigLen(2) + sig + uin(8) + 0(4) + 0(1) + 0x03(1)
  const bodySize = 4 + 2 + sig.length + 8 + 4 + 1 + 1
  const body = Buffer.alloc(bodySize)
  let off = 0
  body.writeUInt32BE(AppInfo.appId, off); off += 4
  body.writeUInt16BE(sig.length, off); off += 2
  sig.copy(body, off); off += sig.length
  body.writeBigUInt64BE(0n, off); off += 8  // uin = 0
  body.writeUInt32BE(0, off); off += 4
  body.writeUInt8(0, off); off += 1
  body.writeUInt8(0x03, off); off += 1

  const code2d = buildCode2dPacket(0x12, body)
  const wtLogin = buildWtLoginFrame(0, 'wtlogin.trans_emp', code2d, client.getEcdhPublicKey(), client.getEcdhShareKey())

  const resp = await client.sendCommand(
    'wtlogin.trans_emp',
    wtLogin,
    EncryptType.EncryptEmpty,
    10000,
  )

  return parseTransEmp12Response(resp.payload, client.getEcdhShareKey())
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
  const wtLogin = buildWtLoginFrame(uin, 'wtlogin.login', encryptedLogin, client.getEcdhPublicKey(), client.getEcdhShareKey())

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
  const header = Buffer.alloc(12) // field0(4) + appId(4) + appIdQrCode(4)
  header.writeUInt32BE(0, 0)                    // field0 = 0
  header.writeUInt32BE(AppInfo.appId, 4)        // appId
  header.writeUInt32BE(AppInfo.subAppId, 8)     // appIdQrCode = SubAppId
  parts.push(header)
  parts.push(client.getGuid())                  // guid (raw 16 bytes)
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

function buildTlvD1(): Buffer {
  // Proto: field 1 (system): {field 1: os, field 2: name}, field 4 (type): bytes [0x30, 0x01]

  // Build system message
  const devType = Buffer.from(DeviceInfo.devType)
  const devName = Buffer.from(DeviceInfo.devName)
  const systemParts: Buffer[] = []
  systemParts.push(encodeProtoString(1, devType))
  systemParts.push(encodeProtoString(2, devName))
  const system = Buffer.concat(systemParts)

  // Build outer
  const parts: Buffer[] = []
  parts.push(encodeProtoBytes(1, system))
  parts.push(encodeProtoBytes(4, Buffer.from([0x30, 0x01])))

  return Buffer.concat(parts)
}


// Proto encoding helpers
function encodeProtoVarint(fieldNum: number, value: number): Buffer {
  const tag = (fieldNum << 3) | 0 // wire type 0 = varint
  const tagBuf = encodeVarintBuf(tag)
  const valBuf = encodeVarintBuf(value)
  return Buffer.concat([tagBuf, valBuf])
}

function encodeProtoString(fieldNum: number, data: Buffer): Buffer {
  return encodeProtoBytes(fieldNum, data)
}

function encodeProtoBytes(fieldNum: number, data: Buffer): Buffer {
  const tag = (fieldNum << 3) | 2 // wire type 2 = length-delimited
  const tagBuf = encodeVarintBuf(tag)
  const lenBuf = encodeVarintBuf(data.length)
  return Buffer.concat([tagBuf, lenBuf, data])
}

function encodeVarintBuf(value: number): Buffer {
  const bytes: number[] = []
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80)
    value >>>= 7
  }
  bytes.push(value & 0x7f)
  return Buffer.from(bytes)
}

// --- Response parsers ---

function parseTransEmp31Response(data: Buffer, shareKey: Buffer): QrCodeResult {
  // WtLogin response: 0x02 + header(15 bytes) + encrypted + 0x03
  if (data[0] !== 0x02 || data[data.length - 1] !== 0x03) {
    throw new Error('Invalid WtLogin response frame')
  }

  // Skip 0x02, then header: internalLength(2)+version(2)+commandId(2)+sequence(2)+uin(4)+flag(1)+retryTime(2) = 15
  const encrypted = data.subarray(1 + 15, data.length - 1)

  // TEA decrypt with ECDH shared key
  let decrypted: Buffer
  try {
    decrypted = Buffer.from(teaDecrypt(encrypted, shareKey))
  } catch {
    throw new Error('Failed to decrypt TransEmp31 response')
  }

  // unwrapTransEmpPacket: skip 8 bytes, read subCommand(uint16), skip 40 bytes, read appId(uint32), then rest is data
  // Per tanebi: readOffset += 8; subCommand = readUInt16BE(); readOffset += 40; appId = readUInt32BE(); data = rest
  let offset = 0
  offset += 8          // skip
  const subCmd = decrypted.readUInt16BE(offset); offset += 2
  offset += 40         // skip
  const appId = decrypted.readUInt32BE(offset); offset += 4
  const transEmpData = decrypted.subarray(offset)

  // Parse TransEmp31Response: dummyByte(uint8) + signature(bytes, uint16 prefix) + tlvPack(rest)
  let dOff = 0
  const dummyByte = transEmpData.readUInt8(dOff); dOff += 1

  // signature with uint16 length prefix (length does NOT include prefix itself)
  const sigLen = transEmpData.readUInt16BE(dOff); dOff += 2
  const sig = Buffer.from(transEmpData.subarray(dOff, dOff + sigLen)); dOff += sigLen

  // TLV collection (rest)
  const tlvData = transEmpData.subarray(dOff)
  const tlvs = tlvUnpack(tlvData)

  // Extract QR URL from TLV 0xD1 (protobuf: field 2 = url string)
  let url = ''
  const tlvD1 = tlvs.get(0xD1)
  if (tlvD1) {
    // TLV 0xD1 is protobuf. Field 2 = qrUrl. Extract URL with simple regex.
    const str = tlvD1.toString('latin1')
    const urlStart = str.indexOf('https://')
    if (urlStart >= 0) {
      // URL ends at first non-printable or non-URL character
      let urlEnd = urlStart
      while (urlEnd < str.length && str.charCodeAt(urlEnd) >= 0x20 && str.charCodeAt(urlEnd) < 0x7f) urlEnd++
      url = str.slice(urlStart, urlEnd)
    }
  }

  // Extract QR image from TLV 0x17
  const image = tlvs.get(0x17) || Buffer.alloc(0)

  return { url, image, sig, tgtgtKey: shareKey }
}


function parseTransEmp12Response(data: Buffer, shareKey: Buffer): QrPollResult {
  // Same WtLogin unwrap as TransEmp31
  if (data[0] !== 0x02 || data[data.length - 1] !== 0x03) {
    throw new Error('Invalid WtLogin response frame')
  }

  const encrypted = data.subarray(1 + 15, data.length - 1)

  let decrypted: Buffer
  try {
    decrypted = Buffer.from(teaDecrypt(encrypted, shareKey))
  } catch {
    throw new Error('Failed to decrypt TransEmp12 response')
  }

  // unwrapTransEmpPacket: skip 8, read subCommand, skip 40, read appId, then data
  let offset = 0
  offset += 8
  offset += 2  // subCommand
  offset += 40
  offset += 4  // appId
  const transEmpData = decrypted.subarray(offset)

  // TransEmp12Response: same as tanebi's TransEmp12Response structure
  // dummyByte(1) + state depends on content
  let dOff = 0
  const state = transEmpData.readUInt8(dOff) as QrCodeState; dOff += 1

  if (state !== QrCodeState.Confirmed) {
    return { state }
  }

  // When confirmed: signature(uint16 prefix) + tlvPack
  const sigLen = transEmpData.readUInt16BE(dOff); dOff += 2
  dOff += sigLen // skip sig

  // TLV collection
  const tlvData = transEmpData.subarray(dOff)
  const tlvs = tlvUnpack(tlvData)

  // Extract credentials
  return {
    state,
    uin: '', // Will be obtained from getCorrectUin like tanebi does
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
