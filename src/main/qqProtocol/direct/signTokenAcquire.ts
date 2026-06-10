// 跑 sign-token 协议握手 (P-256 ECDH + AES-256-GCM) 拿 32B session_key.
//
// ## ★ 重大澄清 (2026-06-10 实测后)
//
// 老的设想是: Bot 跑完 KEX/ESK/SecureAccess 三步握手, 把 raw response 喂给
// manager-server, manager 解出 12B ASCII sign-token (e.g. "aUIOeuqqqfxm").
//
// 但实测 (NTQQSign repo full_chain_20260610-110943.jsonl) 显示:
//   - 整个登录流程只有 5 次 AES-GCM 操作 (3 enc + 2 dec)
//   - SsoEstablishShareKey 1339B / SsoSecureAccess 1306B blob 不通过 GCM 路径产生
//   - 12B 协议层 sign-token 不在任何 GCM blob plain 里
//   - 12B token 实际存在于 sign-context C++ struct + 48 字段, 由 QQ NT 客户端内部维护
//
// 也就是说**Bot 自己跑握手取不到 12B token**. 真正能稳定拿到 12B token 的方法:
//   1. (现状) 完全不要 12B token, sign 算法用 empty token, 大多数 cmd 服务器接受
//   2. manager-server 端跑一份独立 QQ 实例 + frida hook find_token.py 读, 通过
//      sign-service 接口下发 -- 但那是 manager 后端的事, 跟 Bot 无关
//   3. Bot 自身 hook 不可能 (Bot 不是 QQ 进程)
//
// 所以本文件实际职责缩小到:
//   - sendKex 实装 (已完成, 用于实测验证 manager-server 的 ECDH 公式)
//   - 跟 manager 同步一些 session-level 状态 (share_key_2, session_key) 留作后续用途
//   - **不再尝试**端到端获取 12B token. 现有 sign 调用继续用 empty token.
//
// 这个文件保留下来的价值: 给 manager-server `decrypt_session()` 提供输入, 让我们能
// 实测确认 ECDH + ESK 路径在生产里能跑通. 12B token 获取问题等找到非 GCM 路径之后再回来.

import { createECDH, createHash, randomBytes } from 'node:crypto'
import { DirectProtocolClient } from './client'
import { generateP256KeyPair } from './signTokenEcdh'
import { loadMachineGuid } from './machineGuid'
import { pbBytes, pbVarint } from './pbCodec'

export class NotImplementedError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'NotImplementedError'
  }
}

/**
 * 实测 ECDH 完成后能拿到的所有上下文.
 * - shareKey2 = ECDH(client_priv, server_eph_pub_from_KEX_response). 用于解 ESK response.
 * - sessionKey = ESK plain.field1 (32B). 用于加密 NTLoginEasyLogin / 后续业务 cmd 的 GCM blob.
 *
 * 注意: 12B 协议层 sign-token 不包含在这个上下文里 (见文件顶部注释).
 */
export interface SessionContext {
  shareKey2: Buffer
  sessionKey: Buffer
  eskPlain: Buffer
}

interface SessionContextResp {
  code: number
  message: string
  share_key_2?: string
  session_key?: string
  esk_plain?: string
}

/**
 * 跑 SsoKeyExchange + SsoEstablishShareKey 两步握手, 把 (client_priv, kex_resp, esk_resp)
 * 喂给 manager-server /api/sign/session-context, 拿到 32B session_key + share_key_2.
 *
 * 失败抛异常. 调用方决定是否 fatal -- 推荐 swallow, 因为现状 sign 流程用 empty token
 * 也能跑大多数 cmd. 这个握手主要用来做端到端协议验证.
 */
export async function acquireSessionContext(
  client: DirectProtocolClient,
  signUrl: string,
  signToken: string,
  uin: number,
): Promise<SessionContext> {
  const { privKey, pubOctet } = generateP256KeyPair()

  const kexResp = await sendKex(client, privKey, pubOctet, uin)
  const eskResp = await sendEstablishShareKey(client, privKey, pubOctet, kexResp)

  const url = signUrl.endsWith('/')
    ? signUrl + 'api/sign/session-context'
    : signUrl + '/api/sign/session-context'

  const reqBody = {
    client_priv: privKey.toString('hex'),
    kex_resp: kexResp.toString('hex'),
    esk_resp: eskResp.toString('hex'),
    uin,
    ts: Math.floor(Date.now() / 1000),
    nonce: randomBytes(16).toString('hex'),
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${signToken}`,
    },
    body: JSON.stringify(reqBody),
  })

  if (!res.ok) {
    let detail = ''
    try { detail = await res.text() } catch { /* ignore */ }
    throw new Error(`session-context HTTP ${res.status}: ${detail}`)
  }
  const json = await res.json() as SessionContextResp
  if (json.code !== 0 || !json.session_key) {
    throw new Error(`session-context code=${json.code} msg=${json.message}`)
  }

  return {
    shareKey2: Buffer.from(json.share_key_2!, 'hex'),
    sessionKey: Buffer.from(json.session_key, 'hex'),
    eskPlain: Buffer.from(json.esk_plain!, 'hex'),
  }
}
//
// SsoKeyExchange field 3 GCM key = ECDH(client_priv, EMBEDDED_SERVER_PUB).
// SsoKeyExchange field 5 GCM key = EMBEDDED_KEY32 (静态 binding-MAC key).
// 详细解码过程 + IDA 偏移见 NTQQSign repo
// memory/sso-keyexchange-request-key-derivation.md.
const EMBEDDED_SERVER_PUB = Buffer.from(
  '049d1423332735980edabe7e9ea451b3395b6f35250db8fc56f25889f628cbae' +
  '3e8e73077914071eeebc108f4e0170057792bb17aa303af652313d17c1ac815e79',
  'hex',
)
const EMBEDDED_KEY32 = Buffer.from(
  'e2733bf403149913cbf80c7a95168bd4ca6935ee53cd39764beebe2e007e3aee',
  'hex',
)
// (int)&byte_1000000 截断 LE 4B; 来自 sub_2D5E150 v41 = (int)&byte_1000000
const V41_LE_BYTES = Buffer.from([0x00, 0x00, 0x00, 0x01])

const SSO_CMD_KEX = 'trpc.login.ecdh.EcdhService.SsoKeyExchange'
const SSO_CMD_ESK = 'trpc.o3.ecdh_access.EcdhAccess.SsoEstablishShareKey'
const SSO_CMD_SECURE = 'trpc.o3.ecdh_access.EcdhAccess.SsoSecureAccess'

// ---- Step 1: SsoKeyExchange (已实装) ---------------------------------------
//
// 完整公式 (跟 sign-token-protocol::build_kex_request_body 镜像):
//   1. share_key = ECDH(client_priv, EMBEDDED_SERVER_PUB)  (raw X 32B, 无 KDF)
//   2. v68 = pb({ f1: uin_string, f2: machine_guid_16B })
//   3. blob3 = iv12 || AES-256-GCM(v68, share_key, iv12).enc.tag
//   4. v39 = client_pub || u32_LE(0x01000000) || blob3 || u64_BE(unix_ts)
//   5. blob5 = iv12 || AES-256-GCM(sha256(v39), EMBEDDED_KEY32, iv12).enc.tag
//   6. body = pb({ f1: client_pub, f2: 1, f3: blob3, f4: ts, f5: blob5 })

/**
 * Pure 函数: 构造 SsoKeyExchange request body. 不发包不读盘, 方便 unit test.
 * IV 由 caller 传 (生产代码用 randomBytes(12), 测试用 deterministic).
 */
export function buildKexRequestBody(args: {
  clientPriv: Buffer
  clientPub: Buffer
  uin: number | string
  machineGuid: Buffer
  ts: number
  iv3: Buffer
  iv5: Buffer
}): Buffer {
  const { clientPriv, clientPub, uin, machineGuid, ts, iv3, iv5 } = args
  if (clientPub.length !== 65 || clientPub[0] !== 0x04) {
    throw new Error(`clientPub must be 65B uncompressed (got len=${clientPub.length} prefix=0x${clientPub[0]?.toString(16) ?? '?'})`)
  }
  if (machineGuid.length !== 16) throw new Error(`machineGuid must be 16B`)
  if (iv3.length !== 12 || iv5.length !== 12) throw new Error('iv3/iv5 must be 12B each')

  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(clientPriv)
  const shareKey = ecdh.computeSecret(EMBEDDED_SERVER_PUB)

  const v68 = Buffer.concat([
    pbBytes(1, Buffer.from(String(uin), 'utf-8')),
    pbBytes(2, machineGuid),
  ])
  const blob3 = aesGcmSeal(shareKey, iv3, v68)

  const tsBuf = Buffer.alloc(8)
  tsBuf.writeBigUInt64BE(BigInt(ts))
  const v39 = Buffer.concat([clientPub, V41_LE_BYTES, blob3, tsBuf])

  const sha = createHash('sha256').update(v39).digest()
  const blob5 = aesGcmSeal(EMBEDDED_KEY32, iv5, sha)

  return Buffer.concat([
    pbBytes(1, clientPub),
    pbVarint(2, 1),
    pbBytes(3, blob3),
    pbVarint(4, ts),
    pbBytes(5, blob5),
  ])
}

async function sendKex(
  client: DirectProtocolClient,
  clientPriv: Buffer,
  clientPub: Buffer,
  uin: number,
): Promise<Buffer> {
  const body = buildKexRequestBody({
    clientPriv,
    clientPub,
    uin,
    machineGuid: await loadMachineGuid(),
    ts: Math.floor(Date.now() / 1000),
    iv3: randomBytes(12),
    iv5: randomBytes(12),
  })
  const resp = await client.sendCommand(SSO_CMD_KEX, body)
  if (resp.retCode !== undefined && resp.retCode !== 0) {
    throw new Error(`SsoKeyExchange retCode=${resp.retCode} extra=${resp.extraMsg ?? ''}`)
  }
  return resp.payload
}

function aesGcmSeal(key: Buffer, iv: Buffer, plain: Buffer): Buffer {
  // dynamic require 避免 cipher 名不规范导致编译期错; createCipheriv 直接走
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCipheriv } = require('node:crypto') as typeof import('node:crypto')
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ct, tag])
}

// ---- Step 2/3: stub (待逆向 GCM key 来源) ----------------------------------
//
// 已知 (来自 LuckyLillia.Sign trace sso_dump_20260608-135044.jsonl):
//
// SsoEstablishShareKey request 1489B PB:
//   field 1 LEN 8    : "getToken" ASCII
//   field 2 LEN 33   : 0x02 || X(32) compressed P-256 (ESK 自己的 keypair, 跟 KEX 不共享)
//   field 4 LEN 66   : ASCII hex of 33B (跟 field 2 不一样的另一个 33B blob)
//   field 5 LEN 1339 : opaque GCM blob
//   field 6 LEN 32   : session_id (== SecureAccess.field 3, 来自 KeyExchange.response)
//
// SsoSecureAccess request 1353B PB:
//   field 1 LEN 8    : "getToken" ASCII
//   field 2 LEN 1306 : opaque GCM blob
//   field 3 LEN 32   : session_id (== ESK.field 6)
//
// ★ 2026-06-10 实测 frida hook 确认 (NTQQSign repo full_chain_20260610-104911.jsonl):
//
//   - KEX response 解开后, 客户端拿 server_eph_pub 重做一次 ECDH:
//       share_key_2 = ECDH(client_priv, server_eph_pub)
//   - share_key_2 用于解密 ESK response 的 138B GCM blob
//   - ESK plain.field1 (32B) = ★ session_key
//   - **session_key** 用于:
//       (a) 加密 SecureAccess request 的 GCM blob
//       (b) 解密 SecureAccess response 的 GCM blob (出 12B token)
//       (c) 后续所有业务 cmd request/response GCM 操作
//   - ESK request 是否需要加密 GCM blob: 老的 sso_dump trace 看到 1339B blob (QR login),
//     新的 fast-login 直接没看到 ESK request encrypt 调用, 可能没必要发. 需进一步确认.

async function sendEstablishShareKey(
  _client: DirectProtocolClient,
  _privKey: Buffer,
  _clientPub: Buffer,
  _kexResp: Buffer,
): Promise<Buffer> {
  void SSO_CMD_ESK
  throw new NotImplementedError('SsoEstablishShareKey: 实装顺序待确定 (实测 fast-login 直接跳过 ESK encrypt)')
}

async function sendSecureAccess(
  _client: DirectProtocolClient,
  _privKey: Buffer,
  _clientPub: Buffer,
  _kexResp: Buffer,
): Promise<Buffer> {
  void SSO_CMD_SECURE
  throw new NotImplementedError('SsoSecureAccess: GCM key 来源待逆向 (推测同 ESK)')
}
