// Bot 侧 sendKex 跟 manager-server sign-token-protocol::build_kex_request_body
// 是同一公式的两份实装. 这个 test 用一组 deterministic 输入 (固定 priv / IV / ts)
// 跑出来的 body, 必须能用同一组输入解回 (uin, machine_guid), 且 blob5 plain
// 必须等于 sha256(v39).
//
// 要做完整 byte-for-byte 跨语言对比, 在 Rust 端也可以用同一组输入跑
// build_kex_request_body. 这里只验证 self round-trip + binding-MAC formula.

import { describe, it, expect } from 'vitest'
import {
  createDecipheriv,
  createECDH,
  createHash,
} from 'node:crypto'
import { buildKexRequestBody } from '../../src/main/qqProtocol/direct/signTokenAcquire'
import { pbDecode } from '../../src/main/qqProtocol/direct/pbCodec'

const EMBEDDED_SERVER_PUB = Buffer.from(
  '049d1423332735980edabe7e9ea451b3395b6f35250db8fc56f25889f628cbae' +
  '3e8e73077914071eeebc108f4e0170057792bb17aa303af652313d17c1ac815e79',
  'hex',
)
const EMBEDDED_KEY32 = Buffer.from(
  'e2733bf403149913cbf80c7a95168bd4ca6935ee53cd39764beebe2e007e3aee',
  'hex',
)
const V41_LE_BYTES = Buffer.from([0x00, 0x00, 0x00, 0x01])

function aesGcmOpen(key: Buffer, blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12)
  const tag = blob.subarray(blob.length - 16)
  const ct = blob.subarray(12, blob.length - 16)
  const dec = createDecipheriv('aes-256-gcm', key, iv)
  dec.setAuthTag(tag)
  return Buffer.concat([dec.update(ct), dec.final()])
}

describe('buildKexRequestBody', () => {
  it('round-trips: blob3 decrypts back to v68, blob5 = sha256(v39)', () => {
    // deterministic priv: 一个固定的 32B (任意非零 < n 都行, 这里挑个能用的)
    const clientPriv = Buffer.from(
      'a7cf2e75798003ffc5653a742bab89f8aae8c4acf460c6e550e357a356b0103f',
      'hex',
    )
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(clientPriv)
    const clientPub = ecdh.getPublicKey(undefined, 'uncompressed')

    const machineGuid = Buffer.from('0123456789abcdef0123456789abcdef', 'hex')
    const uin = 123456789
    const ts = 1780897894
    const iv3 = Buffer.alloc(12, 0x11)
    const iv5 = Buffer.alloc(12, 0x22)

    const body = buildKexRequestBody({
      clientPriv,
      clientPub,
      uin,
      machineGuid,
      ts,
      iv3,
      iv5,
    })

    // 顶层应为 5 字段
    const top = pbDecode(body)
    expect(top.get(1)?.data).toEqual(clientPub)
    expect(top.get(2)?.data).toEqual(1n)
    expect(top.get(4)?.data).toEqual(BigInt(ts))
    const blob3 = top.get(3)?.data as Buffer
    const blob5 = top.get(5)?.data as Buffer
    expect(blob3).toBeInstanceOf(Buffer)
    expect(blob5).toBeInstanceOf(Buffer)
    // blob3 长度 = 12 IV + 29 ct (= len(v68)) + 16 tag = 57; v68 长度依赖 uin 字符串
    // 9 位 uin: 1+1+9 (f1 tag+len+bytes) + 1+1+16 (f2) = 29
    expect(blob3.length).toBe(12 + 29 + 16)
    expect(blob5.length).toBe(12 + 32 + 16)

    // 解 blob3 用 share_key = ECDH(clientPriv, EMBEDDED_SERVER_PUB)
    const shareKey = ecdh.computeSecret(EMBEDDED_SERVER_PUB)
    const v68 = aesGcmOpen(shareKey, blob3)
    const inner = pbDecode(v68)
    expect((inner.get(1)?.data as Buffer).toString('utf-8')).toBe(String(uin))
    expect(inner.get(2)?.data).toEqual(machineGuid)

    // 解 blob5 用 EMBEDDED_KEY32, plaintext 应等于 sha256(v39)
    const blob5Plain = aesGcmOpen(EMBEDDED_KEY32, blob5)
    const tsBuf = Buffer.alloc(8)
    tsBuf.writeBigUInt64BE(BigInt(ts))
    const v39 = Buffer.concat([clientPub, V41_LE_BYTES, blob3, tsBuf])
    const expected = createHash('sha256').update(v39).digest()
    expect(blob5Plain).toEqual(expected)
  })

  it('rejects malformed inputs', () => {
    const goodPriv = Buffer.alloc(32, 1)
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(goodPriv)
    const goodPub = ecdh.getPublicKey(undefined, 'uncompressed')

    expect(() => buildKexRequestBody({
      clientPriv: goodPriv,
      clientPub: Buffer.alloc(33, 0x02),  // 错误长度 (compressed)
      uin: 1, machineGuid: Buffer.alloc(16), ts: 0,
      iv3: Buffer.alloc(12), iv5: Buffer.alloc(12),
    })).toThrow(/65B uncompressed/)

    expect(() => buildKexRequestBody({
      clientPriv: goodPriv, clientPub: goodPub,
      uin: 1, machineGuid: Buffer.alloc(15), ts: 0,
      iv3: Buffer.alloc(12), iv5: Buffer.alloc(12),
    })).toThrow(/16B/)

    expect(() => buildKexRequestBody({
      clientPriv: goodPriv, clientPub: goodPub,
      uin: 1, machineGuid: Buffer.alloc(16), ts: 0,
      iv3: Buffer.alloc(11), iv5: Buffer.alloc(12),
    })).toThrow(/iv3.iv5/)
  })
})
