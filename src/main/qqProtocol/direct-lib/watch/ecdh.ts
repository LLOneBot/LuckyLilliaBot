import { createECDH, createHash } from 'node:crypto'
import type { EcdhKeyPair } from '../ecdh'
import { WATCH_PROFILE } from '../profiles/watch'

// watch wtlogin ECDH: P-256 (prime256v1)。与桌面 ecdh.ts 的 secp192k1 不同。
// 本机 pub = 65B uncompressed (0x04||X||Y); shareKey = md5(sharedX[:16]) (POC main.rs:295-297)。
export function generateWatchEcdhKeyPair(): EcdhKeyPair {
  const ecdh = createECDH('prime256v1')
  const publicKey = ecdh.generateKeys() // 默认 uncompressed 65B (0x04 前缀)
  const sharedX = ecdh.computeSecret(WATCH_PROFILE.wtLoginServerPub) // 32B X
  const shareKey = createHash('md5').update(sharedX.subarray(0, 16)).digest()
  return { publicKey, privateKey: Buffer.from(ecdh.getPrivateKey()), shareKey }
}
