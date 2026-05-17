/**
 * ECDH key exchange for QQ protocol
 * Uses Node.js crypto ECDH with secp256r1 (prime256v1)
 */

import { createECDH, createHash } from 'node:crypto'

export interface EcdhKeyPair {
  publicKey: Buffer
  privateKey: Buffer
  shareKey: Buffer
}

// QQ server's ECDH public key (secp256r1 / prime256v1, 65 bytes uncompressed)
const SERVER_PUBLIC_KEY = Buffer.from(
  '04' +
  'EBCA94D733E399B2DB96EACDD3F69A8BB0F74224E2B44E3357812211D2E62EFB' +
  'C91BB553098E25E33A799ADC7F76FEB208DA7C6522CDB0719A305180CC54A82E',
  'hex'
)

export function generateEcdhKeyPair(): EcdhKeyPair {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()

  const publicKey = Buffer.from(ecdh.getPublicKey())
  const privateKey = Buffer.from(ecdh.getPrivateKey())
  const sharedSecret = ecdh.computeSecret(SERVER_PUBLIC_KEY)
  const shareKey = createHash('md5').update(sharedSecret.subarray(0, 16)).digest()

  return { publicKey, privateKey, shareKey }
}

export function computeSharedKey(privateKey: Buffer, peerPublicKey: Buffer): Buffer {
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(privateKey)
  const sharedSecret = ecdh.computeSecret(peerPublicKey)
  return createHash('md5').update(sharedSecret.subarray(0, 16)).digest()
}
