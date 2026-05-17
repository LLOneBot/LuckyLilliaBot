import { DirectProtocolClient } from './client'
import { EncryptType } from './packet'
import { TlvWriter, tlvUnpack, writeBytes16, writeString16 } from './tlv'
import { teaEncrypt, teaDecrypt } from './tea'
import { AppInfo, DeviceInfo } from './appInfo'

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

export type LoginResult = {
  success: true
  uid: string
  d2: Buffer
  d2Key: Buffer
  tgt: Buffer
  tempPassword: Buffer
} | {
  success: false
  state: number
  tag?: string
  message?: string
}

// Zero buffer for encrypt head (protocol requires zeros, not random)
const BUF16 = Buffer.alloc(16)
const BUF3 = Buffer.alloc(3)
const BUF21 = Buffer.alloc(21)

function buildWtLoginFrame(uin: number, command: 'wtlogin.login' | 'wtlogin.trans_emp', body: Buffer, ecdhPublicKey: Buffer, shareKey: Buffer): Buffer {
  const encrypted = Buffer.from(teaEncrypt(body, shareKey))

  const cmdId = command === 'wtlogin.login' ? 2064 : 2066

  const parts: Buffer[] = []
  const header = Buffer.alloc(2 + 2 + 2 + 4 + 1 + 1 + 4 + 1 + 2 + 2 + 4 + 1 + 1 + 16 + 2 + 2 + ecdhPublicKey.length)
  let off = 0

  header.writeUInt16BE(8001, off); off += 2
  header.writeUInt16BE(cmdId, off); off += 2
  header.writeUInt16BE(0, off); off += 2
  header.writeUInt32BE(uin, off); off += 4
  header.writeUInt8(3, off); off += 1
  header.writeUInt8(135, off); off += 1
  header.writeUInt32BE(0, off); off += 4
  header.writeUInt8(19, off); off += 1
  header.writeUInt16BE(0, off); off += 2
  header.writeUInt16BE(AppInfo.appClientVersion, off); off += 2
  header.writeUInt32BE(0, off); off += 4

  header.writeUInt8(1, off); off += 1
  header.writeUInt8(1, off); off += 1
  BUF16.copy(header, off); off += 16
  header.writeUInt16BE(0x102, off); off += 2
  header.writeUInt16BE(ecdhPublicKey.length, off); off += 2
  ecdhPublicKey.copy(header, off); off += ecdhPublicKey.length

  const innerBody = Buffer.concat([header.subarray(0, off), encrypted, Buffer.from([0x03])])

  // 0x02 prefix + uint16 length (includes self + trailing byte) + body
  const frame = Buffer.alloc(1 + 2 + innerBody.length)
  frame.writeUInt8(0x02, 0)
  frame.writeUInt16BE(innerBody.length + 3, 1)
  innerBody.copy(frame, 3)

  return frame
}

function buildCode2dPacket(subCommand: number, tlv: Buffer): Buffer {
  const timestamp = Math.floor(Date.now() / 1000)

  const requestBody = Buffer.alloc(4 + 1 + 2 + 2 + 21 + 1 + 4 + 2 + 4 + 8 + tlv.length + 1)
  let off = 0

  requestBody.writeUInt32BE(timestamp, off); off += 4
  requestBody.writeUInt8(0x02, off); off += 1
  requestBody.writeUInt16BE(46 + tlv.length, off); off += 2
  requestBody.writeUInt16BE(subCommand, off); off += 2
  BUF21.copy(requestBody, off); off += 21
  requestBody.writeUInt8(0x03, off); off += 1
  requestBody.writeInt32BE(0x32, off); off += 4
  requestBody.writeInt16BE(0, off); off += 2
  requestBody.writeUInt32BE(0, off); off += 4
  requestBody.writeBigUInt64BE(0n, off); off += 8
  tlv.copy(requestBody, off); off += tlv.length
  requestBody.writeUInt8(0x03, off); off += 1

  const outerSize = 1 + 2 + 4 + 4 + 3 + requestBody.length
  const outer = Buffer.alloc(outerSize)
  let oOff = 0

  outer.writeUInt8(0, oOff); oOff += 1
  outer.writeUInt16BE(requestBody.length, oOff); oOff += 2
  outer.writeUInt32BE(AppInfo.appId, oOff); oOff += 4
  outer.writeUInt32BE(0x72, oOff); oOff += 4
  BUF3.copy(outer, oOff); oOff += 3
  requestBody.copy(outer, oOff)

  return outer
}

export async function fetchQrCode(client: DirectProtocolClient): Promise<QrCodeResult> {

  const tlv = new TlvWriter()

  tlv.addTlv(0x16, buildTlv16(client))

  const tlv1B = Buffer.alloc(30)
  tlv1B.writeUInt32BE(0, 0)
  tlv1B.writeUInt32BE(0, 4)
  tlv1B.writeUInt32BE(3, 8)
  tlv1B.writeUInt32BE(4, 12)
  tlv1B.writeUInt32BE(72, 16)
  tlv1B.writeUInt32BE(2, 20)
  tlv1B.writeUInt32BE(2, 24)
  tlv1B.writeUInt16BE(0, 28)
  tlv.addTlv(0x1B, tlv1B)

  const tlv1D = Buffer.alloc(10)
  tlv1D.writeUInt8(1, 0)
  tlv1D.writeUInt32BE(AppInfo.mainSigMap, 1)
  tlv1D.writeUInt32BE(0, 5)
  tlv1D.writeUInt8(0, 9)
  tlv.addTlv(0x1D, tlv1D)

  tlv.addTlv(0x33, client.getGuid())

  tlv.addTlvUint32(0x35, AppInfo.ssoVersion)

  tlv.addTlvUint32(0x66, AppInfo.ssoVersion)

  tlv.addTlv(0xD1, buildTlvD1())

  const bodyParts: Buffer[] = []
  const appIdBuf = Buffer.alloc(4)
  appIdBuf.writeUInt32BE(AppInfo.appId)
  bodyParts.push(appIdBuf)
  bodyParts.push(Buffer.alloc(8))
  bodyParts.push(Buffer.from([0x00]))
  bodyParts.push(Buffer.from([0x00, 0x00]))
  bodyParts.push(tlv.build())
  const innerBody = Buffer.concat(bodyParts)

  const code2d = buildCode2dPacket(0x31, innerBody)
  const wtLogin = buildWtLoginFrame(0, 'wtlogin.trans_emp', code2d, client.getEcdhPublicKey(), client.getEcdhShareKey())

  const resp = await client.sendCommand(
    'wtlogin.trans_emp',
    wtLogin,
    EncryptType.EncryptEmpty,
    10000,
  )

  return parseTransEmp31Response(resp.payload, client.getEcdhShareKey())
}

export async function pollQrCode(client: DirectProtocolClient, sig: Buffer): Promise<QrPollResult> {
  const bodySize = 4 + 2 + sig.length + 8 + 4 + 1 + 1
  const body = Buffer.alloc(bodySize)
  let off = 0
  body.writeUInt32BE(AppInfo.appId, off); off += 4
  body.writeUInt16BE(sig.length, off); off += 2
  sig.copy(body, off); off += sig.length
  body.writeBigUInt64BE(0n, off); off += 8
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

export async function loginWithQrResult(
  client: DirectProtocolClient,
  qrResult: QrPollResult,
): Promise<LoginResult> {
  if (!qrResult.tempPassword || !qrResult.tgtgtKey || !qrResult.noPicSig || !qrResult.uin) {
    throw new Error('QR poll result incomplete')
  }

  const uin = Number(qrResult.uin)
  const tlv = new TlvWriter()

  tlv.addTlv(0x106, qrResult.tempPassword)

  const innerTlv = new TlvWriter()
  innerTlv.addTlv(0x16E, Buffer.from(DeviceInfo.devName))
  innerTlv.addTlv(0x147, buildTlv147())
  innerTlv.addTlv(0x128, buildTlv128(client))
  innerTlv.addTlv(0x124, buildTlv124())
  const encrypted144 = Buffer.from(teaEncrypt(innerTlv.build(), qrResult.tgtgtKey))
  tlv.addTlv(0x144, encrypted144)

  // miscBitmap hardcoded to 12058620 (differs from AppInfo.miscBitmap)
  tlv.addTlv(0x116, buildTlv116())

  const tlv142Parts: Buffer[] = []
  const tlv142Header = Buffer.alloc(2)
  tlv142Header.writeUInt16BE(0)
  tlv142Parts.push(tlv142Header)
  tlv142Parts.push(writeString16(AppInfo.packageName))
  tlv.addTlv(0x142, Buffer.concat(tlv142Parts))

  tlv.addTlv(0x145, client.getGuid())

  tlv.addTlv(0x018, buildTlv018(uin))

  tlv.addTlv(0x141, buildTlv141())

  tlv.addTlv(0x177, buildTlv177())

  tlv.addTlvUint8(0x191, 0)

  tlv.addTlv(0x100, buildTlv100())

  const tlv107 = Buffer.alloc(6)
  tlv107.writeUInt16BE(1, 0)
  tlv107.writeUInt8(0, 2)
  tlv107.writeUInt16BE(0x0D, 3)
  tlv107.writeUInt8(1, 5)
  tlv.addTlv(0x107, tlv107)

  tlv.addTlv(0x318, Buffer.alloc(0))

  tlv.addTlv(0x16A, qrResult.noPicSig)

  tlv.addTlvUint8(0x166, 0x05)

  const tlv521Parts: Buffer[] = []
  const tlv521Header = Buffer.alloc(4)
  tlv521Header.writeUInt32BE(0x13)
  tlv521Parts.push(tlv521Header)
  tlv521Parts.push(writeString16('basicim'))
  tlv.addTlv(0x521, Buffer.concat(tlv521Parts))

  const cmdPrefix = Buffer.alloc(2)
  cmdPrefix.writeUInt16BE(0x09)
  const loginBody = Buffer.concat([cmdPrefix, tlv.build()])

  // buildWtLoginFrame encrypts with ECDH shareKey (NOT tgtgtKey)
  const wtLogin = buildWtLoginFrame(uin, 'wtlogin.login', loginBody, client.getEcdhPublicKey(), client.getEcdhShareKey())

  const resp = await client.sendCommand(
    'wtlogin.login',
    wtLogin,
    EncryptType.EncryptEmpty,
    15000,
  )

  const result = parseLoginResponse(resp.payload, client.getEcdhShareKey(), qrResult.tgtgtKey)
  if (result.success) {
    client.setSession({
      uin: qrResult.uin,
      uid: result.uid,
      d2: result.d2,
      d2Key: result.d2Key,
      tgt: result.tgt,
      a2: result.tgt,
      a2Key: Buffer.alloc(16),
      sKey: Buffer.alloc(0),
    })
  }
  return result
}

// --- TLV builders ---

function buildTlv16(client: DirectProtocolClient): Buffer {
  const parts: Buffer[] = []
  const header = Buffer.alloc(12)
  header.writeUInt32BE(0, 0)
  header.writeUInt32BE(AppInfo.appId, 4)
  header.writeUInt32BE(AppInfo.subAppId, 8)
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
  parts.push(writeString16(AppInfo.ptVersion))
  parts.push(writeString16(AppInfo.packageName))
  return Buffer.concat(parts)
}

function buildTlv128(client: DirectProtocolClient): Buffer {
  const parts: Buffer[] = []
  const header = Buffer.alloc(9)
  header.writeUInt16BE(0, 0)
  header.writeUInt8(0, 2)
  header.writeUInt8(1, 3)
  header.writeUInt8(0, 4)
  header.writeUInt32BE(0, 5)
  parts.push(header)
  parts.push(writeString16(AppInfo.os))
  parts.push(writeBytes16(client.getGuid()))
  parts.push(writeString16(''))
  return Buffer.concat(parts)
}

function buildTlv124(): Buffer {
  return Buffer.alloc(12)
}

function buildTlv116(): Buffer {
  const buf = Buffer.alloc(10)
  buf.writeUInt8(0, 0)
  buf.writeUInt32BE(12058620, 1)
  buf.writeUInt32BE(AppInfo.subSigMap, 5)
  buf.writeUInt8(0, 9)
  return buf
}

function buildTlv018(uin: number = 0): Buffer {
  const buf = Buffer.alloc(22)
  let off = 0
  buf.writeUInt16BE(0, off); off += 2
  buf.writeUInt32BE(5, off); off += 4
  buf.writeUInt32BE(0, off); off += 4
  buf.writeUInt32BE(8001, off); off += 4
  buf.writeUInt32BE(uin, off); off += 4
  buf.writeUInt16BE(0, off); off += 2
  buf.writeUInt16BE(0, off); off += 2
  return buf
}

function buildTlv141(): Buffer {
  const parts: Buffer[] = []
  const unknown = Buffer.from('Unknown')
  const f0Len = Buffer.alloc(4)
  f0Len.writeUInt32BE(unknown.length)
  parts.push(f0Len)
  parts.push(unknown)
  const netType = Buffer.alloc(2)
  netType.writeUInt16BE(0)
  parts.push(netType)
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
  const buf = Buffer.alloc(22)
  let off = 0
  buf.writeUInt16BE(0, off); off += 2
  buf.writeUInt32BE(5, off); off += 4
  buf.writeUInt32BE(AppInfo.appId, off); off += 4
  buf.writeUInt32BE(AppInfo.subAppId, off); off += 4
  buf.writeUInt32BE(AppInfo.appClientVersion, off); off += 4
  buf.writeUInt32BE(AppInfo.mainSigMap, off); off += 4
  return buf
}

function buildTlvD1(): Buffer {
  const devType = Buffer.from(DeviceInfo.devType)
  const devName = Buffer.from(DeviceInfo.devName)
  const systemParts: Buffer[] = []
  systemParts.push(encodeProtoString(1, devType))
  systemParts.push(encodeProtoString(2, devName))
  const system = Buffer.concat(systemParts)

  const parts: Buffer[] = []
  parts.push(encodeProtoBytes(1, system))
  parts.push(encodeProtoBytes(4, Buffer.from([0x30, 0x01])))

  return Buffer.concat(parts)
}


// Proto encoding helpers
function encodeProtoVarint(fieldNum: number, value: number): Buffer {
  const tag = (fieldNum << 3) | 0
  const tagBuf = encodeVarintBuf(tag)
  const valBuf = encodeVarintBuf(value)
  return Buffer.concat([tagBuf, valBuf])
}

function encodeProtoString(fieldNum: number, data: Buffer): Buffer {
  return encodeProtoBytes(fieldNum, data)
}

function encodeProtoBytes(fieldNum: number, data: Buffer): Buffer {
  const tag = (fieldNum << 3) | 2
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
  if (data[0] !== 0x02 || data[data.length - 1] !== 0x03) {
    throw new Error('Invalid WtLogin response frame')
  }

  // Header: 0x02(1) + internalLength(2)+version(2)+commandId(2)+sequence(2)+uin(4)+flag(1)+retryTime(2) = 15 bytes
  const encrypted = data.subarray(1 + 15, data.length - 1)

  let decrypted: Buffer
  try {
    decrypted = Buffer.from(teaDecrypt(encrypted, shareKey))
  } catch {
    throw new Error('Failed to decrypt TransEmp31 response')
  }

  // Unwrap TransEmp packet: skip(8) + subCommand(2) + skip(40) + appId(4) + data
  let offset = 0
  offset += 8
  const subCmd = decrypted.readUInt16BE(offset); offset += 2
  offset += 40
  const appId = decrypted.readUInt32BE(offset); offset += 4
  const transEmpData = decrypted.subarray(offset)

  let dOff = 0
  const dummyByte = transEmpData.readUInt8(dOff); dOff += 1

  const sigLen = transEmpData.readUInt16BE(dOff); dOff += 2
  const sig = Buffer.from(transEmpData.subarray(dOff, dOff + sigLen)); dOff += sigLen

  const tlvData = transEmpData.subarray(dOff)
  const tlvs = tlvUnpack(tlvData)

  let url = ''
  const tlvD1 = tlvs.get(0xD1)
  if (tlvD1) {
    const str = tlvD1.toString('latin1')
    const urlStart = str.indexOf('https://')
    if (urlStart >= 0) {
      let urlEnd = urlStart
      while (urlEnd < str.length && str.charCodeAt(urlEnd) >= 0x20 && str.charCodeAt(urlEnd) < 0x7f) urlEnd++
      url = str.slice(urlStart, urlEnd)
    }
  }

  const image = tlvs.get(0x17) || Buffer.alloc(0)

  return { url, image, sig, tgtgtKey: shareKey }
}


function parseTransEmp12Response(data: Buffer, shareKey: Buffer): QrPollResult {
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

  // Unwrap TransEmp packet: skip(8) + subCommand(2) + skip(40) + appId(4) + data
  let offset = 0
  offset += 8
  offset += 2
  offset += 40
  offset += 4
  const transEmpData = decrypted.subarray(offset)

  let dOff = 0
  const state = transEmpData.readUInt8(dOff) as QrCodeState; dOff += 1

  if (state !== QrCodeState.Confirmed) {
    return { state }
  }

  // When confirmed: 12 bytes misc + TLV pack
  dOff += 12

  const tlvData = transEmpData.subarray(dOff)
  const tlvs = tlvUnpack(tlvData)

  return {
    state,
    uin: '',
    tgtgtKey: tlvs.get(0x1E),
    noPicSig: tlvs.get(0x19),
    tempPassword: tlvs.get(0x18),
  }
}

function parseLoginResponse(data: Buffer, shareKey: Buffer, tgtgtKey: Buffer): LoginResult {
  if (data[0] !== 0x02 || data[data.length - 1] !== 0x03) {
    throw new Error('Invalid WtLogin response frame')
  }

  const encrypted = data.subarray(1 + 15, data.length - 1)

  let decrypted: Buffer
  try {
    decrypted = Buffer.from(teaDecrypt(encrypted, shareKey))
  } catch (e) {
    throw new Error(`Failed to decrypt login response: ${(e as Error).message}`)
  }

  let offset = 0
  const command = decrypted.readUInt16BE(offset); offset += 2
  const state = decrypted.readUInt8(offset); offset += 1

  if (state !== 0) {
    const tlvData = decrypted.subarray(offset)
    const tlvs = tlvUnpack(tlvData)
    const errBuf = tlvs.get(0x146)
    if (errBuf && errBuf.length > 6) {
      let eOff = 4
      const tagLen = errBuf.readUInt16BE(eOff); eOff += 2
      const tag = errBuf.subarray(eOff, eOff + tagLen).toString(); eOff += tagLen
      const msgLen = errBuf.readUInt16BE(eOff); eOff += 2
      const message = errBuf.subarray(eOff, eOff + msgLen).toString()
      return { success: false, state, tag, message }
    }
    return { success: false, state }
  }

  const tlvData = decrypted.subarray(offset)
  const tlvs = tlvUnpack(tlvData)

  // TLV 0x119 contains session credentials encrypted with tgtgtKey
  const tlv119 = tlvs.get(0x119)
  if (!tlv119) {
    throw new Error('Login response missing TLV 0x119')
  }

  const decrypted119 = Buffer.from(teaDecrypt(tlv119, tgtgtKey))
  const nestedTlvs = tlvUnpack(decrypted119)

  const d2 = nestedTlvs.get(0x143) || Buffer.alloc(0)
  const d2Key = nestedTlvs.get(0x305) || Buffer.alloc(16)
  const tgt = nestedTlvs.get(0x10A) || Buffer.alloc(0)
  const tempPassword = nestedTlvs.get(0x106) || Buffer.alloc(0)

  // TLV 0x543 protobuf: { field9: { field11: { field1: uid_string } } }
  let uid = ''
  const tlv543 = nestedTlvs.get(0x543)
  if (tlv543) {
    uid = parseUidFromTlv543(tlv543)
  }

  return { success: true, uid, d2, d2Key, tgt, tempPassword }
}

function parseUidFromTlv543(data: Buffer): string {
  try {
    const layer1 = decodeProtoField(data, 9)
    if (!layer1) return ''
    const layer2 = decodeProtoField(layer1, 11)
    if (!layer2) return ''
    const uidBuf = decodeProtoField(layer2, 1)
    if (!uidBuf) return ''
    return uidBuf.toString('utf-8')
  } catch {
    return ''
  }
}

function decodeProtoField(data: Buffer, targetField: number): Buffer | null {
  let offset = 0
  while (offset < data.length) {
    const byte = data[offset]
    let tag = 0
    let shift = 0
    let pos = offset
    while (pos < data.length) {
      const b = data[pos]
      tag |= (b & 0x7f) << shift
      pos++
      if ((b & 0x80) === 0) break
      shift += 7
    }
    offset = pos

    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07

    if (wireType === 0) {
      while (offset < data.length && (data[offset] & 0x80) !== 0) offset++
      offset++
    } else if (wireType === 2) {
      let len = 0
      let lenShift = 0
      while (offset < data.length) {
        const b = data[offset]
        len |= (b & 0x7f) << lenShift
        offset++
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

export async function getCorrectUin(appId: number, qrSig: string): Promise<number> {
  const res = await fetch('https://ntlogin.qq.com/qr/getFace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appid: appId, faceUpdateTime: 0, qrsig: qrSig }),
  })
  const json = await res.json() as { uin: number }
  return json.uin
}
