/**
 * ECDH key exchange for QQ protocol
 * WtLogin uses secp192k1, SSO reserved uses prime256v1
 */

import { createECDH, createHash } from 'node:crypto'

export interface EcdhKeyPair {
  publicKey: Buffer
  privateKey: Buffer
  shareKey: Buffer
}

// QQ server's ECDH public key for WtLogin (secp192k1, 49 bytes uncompressed)
const SERVER_PUBLIC_KEY_192K1 = Buffer.from([
  0x04, 0x92, 0x8D, 0x88, 0x50, 0x67, 0x30, 0x88, 0xB3, 0x43,
  0x26, 0x4E, 0x0C, 0x6B, 0xAC, 0xB8, 0x49, 0x6D, 0x69, 0x77,
  0x99, 0xF3, 0x72, 0x11, 0xDE, 0xB2, 0x5B, 0xB7, 0x39, 0x06,
  0xCB, 0x08, 0x9F, 0xEA, 0x96, 0x39, 0xB4, 0xE0, 0x26, 0x04,
  0x98, 0xB5, 0x1A, 0x99, 0x2D, 0x50, 0x81, 0x3D, 0xA8,
])

export function generateEcdhKeyPair(): EcdhKeyPair {
  const ecdh = createECDH('secp192k1')
  ecdh.generateKeys()

  const publicKey = Buffer.from(ecdh.getPublicKey('binary', 'compressed'))
  const privateKey = Buffer.from(ecdh.getPrivateKey())
  const sharedSecret = ecdh.computeSecret(SERVER_PUBLIC_KEY_192K1)
  const shareKey = createHash('md5').update(sharedSecret.subarray(0, 16)).digest()

  return { publicKey, privateKey, shareKey }
}

export function computeSharedKey(privateKey: Buffer, peerPublicKey: Buffer): Buffer {
  const ecdh = createECDH('secp192k1')
  ecdh.setPrivateKey(privateKey)
  const sharedSecret = ecdh.computeSecret(peerPublicKey)
  return createHash('md5').update(sharedSecret.subarray(0, 16)).digest()
}
