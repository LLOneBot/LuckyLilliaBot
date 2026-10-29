import { createECDH, createHash } from 'node:crypto'

export interface EcdhKeyPair {
  publicKey: Buffer
  privateKey: Buffer
  shareKey: Buffer
}

// QQ server's ECDH public key for WtLogin (secp192k1)
const SERVER_PUBLIC_KEY_192K1 = Buffer.from([
  0x04, 0x92, 0x8D, 0x88, 0x50, 0x67, 0x30, 0x88, 0xB3, 0x43,
  0x26, 0x4E, 0x0C, 0x6B, 0xAC, 0xB8, 0x49, 0x6D, 0x69, 0x77,
  0x99, 0xF3, 0x72, 0x11, 0xDE, 0xB2, 0x5B, 0xB7, 0x39, 0x06,
  0xCB, 0x08, 0x9F, 0xEA, 0x96, 0x39, 0xB4, 0xE0, 0x26, 0x04,
  0x98, 0xB5, 0x1A, 0x99, 0x2D, 0x50, 0x81, 0x3D, 0xA8,
])

export function generateEcdhKeyPair(): EcdhKeyPair {
  const ecdh = createECDH('secp192k1')
  const rawPublicKey = ecdh.generateKeys()

  // Always use 0x02 prefix + X coordinate, not standard compress (which may use 0x03)
  const publicKey = Buffer.concat([Buffer.from([0x02]), rawPublicKey.subarray(1, 25)])

  const sharedSecret = ecdh.computeSecret(SERVER_PUBLIC_KEY_192K1)
  const shareKey = createHash('md5').update(sharedSecret).digest().subarray(0, 16)

  const privateKey = Buffer.from(ecdh.getPrivateKey())

  return { publicKey, privateKey, shareKey }
}

export function computeSharedKey(privateKey: Buffer, peerPublicKey: Buffer): Buffer {
  const ecdh = createECDH('secp192k1')
  ecdh.setPrivateKey(privateKey)
  const sharedSecret = ecdh.computeSecret(peerPublicKey)
  return createHash('md5').update(sharedSecret.subarray(0, 16)).digest()
}
