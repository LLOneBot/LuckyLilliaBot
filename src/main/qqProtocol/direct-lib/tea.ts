/**
 * TEA cipher implementation (Tencent QQ variant)
 * 16-round TEA with QQ-specific CBC chaining and random padding
 */

const DELTA = 0x9E3779B9
const ROUNDS = 16

function toUint32(n: number): number {
  return n >>> 0
}

function teaEncryptBlock(v0: number, v1: number, key: Uint32Array): [number, number] {
  let sum = 0
  for (let i = 0; i < ROUNDS; i++) {
    sum = toUint32(sum + DELTA)
    v0 = toUint32(v0 + toUint32(
      (toUint32(v1 << 4) + key[0]) ^
      (toUint32(v1 + sum)) ^
      (toUint32(v1 >>> 5) + key[1])
    ))
    v1 = toUint32(v1 + toUint32(
      (toUint32(v0 << 4) + key[2]) ^
      (toUint32(v0 + sum)) ^
      (toUint32(v0 >>> 5) + key[3])
    ))
  }
  return [v0, v1]
}

function teaDecryptBlock(v0: number, v1: number, key: Uint32Array): [number, number] {
  let sum = toUint32(DELTA * ROUNDS)
  for (let i = 0; i < ROUNDS; i++) {
    v1 = toUint32(v1 - toUint32(
      (toUint32(v0 << 4) + key[2]) ^
      (toUint32(v0 + sum)) ^
      (toUint32(v0 >>> 5) + key[3])
    ))
    v0 = toUint32(v0 - toUint32(
      (toUint32(v1 << 4) + key[0]) ^
      (toUint32(v1 + sum)) ^
      (toUint32(v1 >>> 5) + key[1])
    ))
    sum = toUint32(sum - DELTA)
  }
  return [v0, v1]
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0
}

function writeUint32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff
  buf[offset + 1] = (value >>> 16) & 0xff
  buf[offset + 2] = (value >>> 8) & 0xff
  buf[offset + 3] = value & 0xff
}

function parseKey(key: Uint8Array): Uint32Array {
  if (key.length !== 16) throw new Error('TEA key must be 16 bytes')
  return new Uint32Array([
    readUint32BE(key, 0),
    readUint32BE(key, 4),
    readUint32BE(key, 8),
    readUint32BE(key, 12),
  ])
}

export function teaEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const k = parseKey(key)

  // Padding: fill(3~10 random bytes) + data + 7 zero bytes
  const fill = 10 - ((data.length + 1) & 7)
  const totalLen = fill + data.length + 7
  const plain = new Uint8Array(totalLen)

  for (let i = 0; i < fill; i++) {
    plain[i] = Math.floor(Math.random() * 256)
  }
  plain[0] = ((fill - 3) & 0x07) | 0xF8

  plain.set(data, fill)

  // QQ-specific CBC mode: cipher = encrypt(plain ^ prevCipher) ^ prevPlain
  const out = new Uint8Array(totalLen)
  plain.set(data, fill)
  out.set(plain)

  let plainXorHi = 0, plainXorLo = 0
  let prevXorHi = 0, prevXorLo = 0

  for (let i = 0; i < totalLen; i += 8) {
    const pHi = readUint32BE(out, i) ^ plainXorHi
    const pLo = readUint32BE(out, i + 4) ^ plainXorLo

    const [cHi, cLo] = teaEncryptBlock(pHi, pLo, k)

    plainXorHi = cHi ^ prevXorHi
    plainXorLo = cLo ^ prevXorLo
    prevXorHi = pHi
    prevXorLo = pLo

    writeUint32BE(out, i, plainXorHi)
    writeUint32BE(out, i + 4, plainXorLo)
  }

  return out
}

export function teaDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const k = parseKey(key)

  if (data.length < 16 || data.length % 8 !== 0) {
    throw new Error('TEA decrypt: invalid data length')
  }

  // QQ-specific CBC mode decryption
  const plain = new Uint8Array(data.length)
  let plainXorHi = 0, plainXorLo = 0
  let prevXorHi = 0, prevXorLo = 0

  for (let i = 0; i < data.length; i += 8) {
    const cHi = readUint32BE(data, i)
    const cLo = readUint32BE(data, i + 4)

    plainXorHi ^= cHi
    plainXorLo ^= cLo

    const [dHi, dLo] = teaDecryptBlock(plainXorHi, plainXorLo, k)

    plainXorHi = dHi
    plainXorLo = dLo

    writeUint32BE(plain, i, plainXorHi ^ prevXorHi)
    writeUint32BE(plain, i + 4, plainXorLo ^ prevXorLo)

    prevXorHi = cHi
    prevXorLo = cLo
  }

  // Extract data: skip fill bytes, strip 7 trailing zeros
  const fill = (plain[0] & 0x07) + 3
  const start = fill
  const end = data.length - 7

  if (start >= end) {
    throw new Error('TEA decrypt: invalid padding')
  }

  return plain.slice(start, end)
}
