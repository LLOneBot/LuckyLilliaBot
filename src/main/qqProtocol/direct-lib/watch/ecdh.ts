import { createECDH, createHash } from 'node:crypto'
import type { EcdhKeyPair } from '../ecdh'
import { WATCH_PROFILE } from '../profiles/watch'

// pub = 65B uncompressed; shareKey = md5(sharedX[:16])
export function generateWatchEcdhKeyPair(): EcdhKeyPair {
  const ecdh = createECDH('prime256v1')
  const publicKey = ecdh.generateKeys()
  const sharedX = ecdh.computeSecret(WATCH_PROFILE.wtLoginServerPub)
  const shareKey = createHash('md5').update(sharedX.subarray(0, 16)).digest()
  return { publicKey, privateKey: Buffer.from(ecdh.getPrivateKey()), shareKey }
}
