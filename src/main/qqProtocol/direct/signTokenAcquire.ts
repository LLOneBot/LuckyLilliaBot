// 跑 sign-token 三步握手 (P-256 ECDH + AES-256-GCM) 拿 12B ASCII 协议层 token.
//
// 结构是: Bot 跟 QQ server 三个 SSO cmd 拿 raw response PB blob, 一次性把
// (client_priv, 3 个 response) 喂给 manager-server /api/sign/token-exchange,
// manager 端跑 P-256 ECDH 算 share-key + AES-256-GCM 解密返回 12B token.
//
// 协议层 token 跟 manager-server JWT signToken 完全是两个东西:
//   - signToken (Bearer)   = manager-server 颁发的 client JWT, 证明 "我是合法 Bot"
//   - 12B sign-token       = QQ server 颁发, MD5(token + extra + body) 喂给 sign 算法
//
// ## Phase 2 status (本文件状态)
//
// - sendKex: ★ **已实装**. 完整公式来自 NTQQSign repo
//   memory/sso-keyexchange-request-key-derivation.md, 跟 Rust 端
//   sign-token-protocol::build_kex_request_body 是同一份算法的 TypeScript port.
// - sendEstablishShareKey / sendSecureAccess: 还是 stub. 这俩 cmd 的 request
//   GCM blob 用什么 key 还没反编译 (推测 share_key + 嵌套 keypair, 见末尾 README).
//
// 当前 acquireSignToken 进展到第 1/3 步就会 throw. 等 ESK/SecureAccess 补完,
// 整个三步握手就跑通了.

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

export interface AcquireResult {
  token: string  // 12B ASCII e.g. "aUIOeuqqqfxm"
  expiresAt: number  // unix sec
}

interface TokenExchangeResp {
  code: number
  message: string
  token?: string
}

interface TokenCacheResp {
  code: number
  message: string
  token?: string | null
  ttl_secs?: number | null
}

// ---- 嵌入常量 (来自 wrapper.node, SSE 解码后) -------------------------------
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

/**
 * 跑三步握手 + 调 manager /api/sign/token-exchange. 失败抛异常, 调用方决定是否
 * fatal -- 推荐 swallow 后让 sign 用空 token (现有行为).
 *
 * 启动时优先查 manager 端 /api/sign/token-cache, 命中 (i.e. 25 分钟内已经跑过
 * 一次握手) 就直接返回, 不重头跑 -- 避免 server-side ECDH session 浪费.
 */
export async function acquireSignToken(
  client: DirectProtocolClient,
  signUrl: string,
  signToken: string,
  uin: number,
): Promise<AcquireResult> {
  // Step 0: cache hit?
  const cached = await checkTokenCache(signUrl, signToken, uin)
  if (cached) {
    return cached
  }

  const { privKey, pubOctet } = generateP256KeyPair()

  // Step 1: SsoKeyExchange (已实装)
  const kexResp = await sendKex(client, privKey, pubOctet, uin)

  // Step 2/3: ESK + SecureAccess (尚未实装) -- 抛 NotImplementedError
  // 让 caller swallow.
  const eskResp = await sendEstablishShareKey(client, privKey, pubOctet, kexResp)
  const secureResp = await sendSecureAccess(client, privKey, pubOctet, kexResp)

  const exchangeUrl = signUrl.endsWith('/')
    ? signUrl + 'api/sign/token-exchange'
    : signUrl + '/api/sign/token-exchange'

  const reqBody = {
    client_priv: privKey.toString('hex'),
    kex_resp: kexResp.toString('hex'),
    esk_resp: eskResp.toString('hex'),
    secure_resp: secureResp.toString('hex'),
    uin,
    ts: Math.floor(Date.now() / 1000),
    nonce: randomBytes(16).toString('hex'),
  }

  const res = await fetch(exchangeUrl, {
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
    throw new Error(`token-exchange HTTP ${res.status}: ${detail}`)
  }
  const json = await res.json() as TokenExchangeResp
  if (json.code !== 0 || !json.token) {
    throw new Error(`token-exchange code=${json.code} msg=${json.message}`)
  }
  // 缓存 25min, 跟 manager-server 那边 redis TTL 对齐
  return { token: json.token, expiresAt: Math.floor(Date.now() / 1000) + 25 * 60 }
}

async function checkTokenCache(signUrl: string, signToken: string, uin: number): Promise<AcquireResult | null> {
  const url = signUrl.endsWith('/')
    ? `${signUrl}api/sign/token-cache?uin=${uin}`
    : `${signUrl}/api/sign/token-cache?uin=${uin}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${signToken}` },
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    return null  // cache 不可用不致命, 继续走完整握手
  }
  if (!res.ok) return null
  const json = (await res.json().catch(() => null)) as TokenCacheResp | null
  if (!json || json.code !== 0 || !json.token) return null
  const ttl = json.ttl_secs ?? 0
  return {
    token: json.token,
    expiresAt: Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : 25 * 60),
  }
}

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
