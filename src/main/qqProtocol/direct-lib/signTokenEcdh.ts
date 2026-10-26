// sign-token 握手 (SsoKeyExchange / SsoEstablishShareKey / SsoSecureAccess) 用的 P-256, 不是 wtlogin 的 secp192k1。
// share-key 是 ECDH 的 raw X 坐标 (32B), 不过 KDF, 直接当 AES-256-GCM key

import { createECDH } from 'node:crypto'

export interface P256KeyPair {
  // 32B raw scalar
  privKey: Buffer
  // 65B uncompressed: 0x04 || X(32) || Y(32) -- QQ server 期望这个格式
  pubOctet: Buffer
}

export function generateP256KeyPair(): P256KeyPair {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return {
    privKey: ecdh.getPrivateKey(),
    pubOctet: ecdh.getPublicKey(undefined, 'uncompressed'),
  }
}
