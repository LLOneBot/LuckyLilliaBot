/**
 * TEA (Tiny Encryption Algorithm) cipher implementation
 * Compatible with Tencent's QQ protocol TEA variant
 * 16-round TEA with CBC-like chaining and random padding
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

  // Padding: (1 byte header) + (random fill to align to 8 bytes) + data + (7 bytes zero tail)
  const fillCount = (8 - ((data.length + 10) % 8)) % 8
  const padLen = 1 + fillCount + 2 // 1 header + fill + 2 zero bytes before data
  const totalLen = padLen + data.length + 7
  const plain = new Uint8Array(totalLen)

  // Header byte: (fillCount & 0x07) | (random high bits)
  plain[0] = (fillCount & 0x07) | ((Math.random() * 0xf8) & 0xf8)
  // Random fill bytes
  for (let i = 1; i <= fillCount + 2; i++) {
    plain[i] = Math.floor(Math.random() * 256)
  }
  // Copy data
  plain.set(data, padLen)
  // Last 7 bytes are zero (already)

  // CBC encrypt
  const out = new Uint8Array(totalLen)
  let prevCipher0 = 0, prevCipher1 = 0
  let prevPlain0 = 0, prevPlain1 = 0

  for (let i = 0; i < totalLen; i += 8) {
    const p0 = readUint32BE(plain, i) ^ prevCipher0
    const p1 = readUint32BE(plain, i + 4) ^ prevCipher1
    const [c0, c1] = teaEncryptBlock(p0, p1, k)
    prevCipher0 = c0
    prevCipher1 = c1
    prevPlain0 = readUint32BE(plain, i)
    prevPlain1 = readUint32BE(plain, i + 4)
    writeUint32BE(out, i, c0)
    writeUint32BE(out, i + 4, c1)
  }

  return out
}

export function teaDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const k = parseKey(key)

  if (data.length < 16 || data.length % 8 !== 0) {
    throw new Error('TEA decrypt: invalid data length')
  }

  // CBC decrypt
  const plain = new Uint8Array(data.length)
  let prevCipher0 = 0, prevCipher1 = 0

  for (let i = 0; i < data.length; i += 8) {
    const c0 = readUint32BE(data, i)
    const c1 = readUint32BE(data, i + 4)
    const [p0, p1] = teaDecryptBlock(c0, c1, k)
    writeUint32BE(plain, i, p0 ^ prevCipher0)
    writeUint32BE(plain, i + 4, p1 ^ prevCipher1)
    prevCipher0 = c0
    prevCipher1 = c1
  }

  // Extract data: skip padding
  const fillCount = plain[0] & 0x07
  const start = 1 + fillCount + 2
  const end = data.length - 7

  if (start >= end) {
    throw new Error('TEA decrypt: invalid padding')
  }

  return plain.slice(start, end)
}
