// P-256 ECDH 用于 sign-token 协议层 (跟 ecdh.ts 的 secp192k1 wtlogin 不是同一回事)
//
// 用途: 跑 SsoKeyExchange / SsoEstablishShareKey / SsoSecureAccess 三步握手时
// 客户端要带自己的 P-256 (secp256r1 = prime256v1) ephemeral public key, 私钥留着算
// share-key. share-key 是 ECDH 出的 raw X 坐标 (32B), 不走 KDF, 直接当 AES-256-GCM key.

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
