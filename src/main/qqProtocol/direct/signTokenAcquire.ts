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
// ## Phase 1 status
//
// manager-server endpoint 已实装 + 9 unit test pass, 但 Bot 侧三个 SSO cmd 的
// **request body PB schema 还没逆向出来** (我们只 trace 到了 response, request 是
// 加密 protobuf). 所以 acquireSignToken() 当前是 "Phase 1 骨架" -- 调用方应捕获
// `NotImplementedError` 然后 fallback 到空 token (跟当前行为一致, 不阻塞登录).
//
// 后续补 schema 后, 把 buildKex/Esk/SecureAccessRequest 三个函数填掉就能跑通.

import { randomBytes } from 'node:crypto'
import { DirectProtocolClient } from './client'
import { generateP256KeyPair } from './signTokenEcdh'

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

/**
 * 跑三步握手 + 调 manager /api/sign/token-exchange. 失败抛异常, 调用方决定是否
 * fatal -- 推荐 swallow 后让 sign 用空 token (现有行为).
 */
export async function acquireSignToken(
  client: DirectProtocolClient,
  signUrl: string,
  signToken: string,
  uin: number,
): Promise<AcquireResult> {
  const { privKey, pubOctet } = generateP256KeyPair()

  // ★ Phase 1: 三个 SSO cmd request body 的 PB schema 还没逆向. 任一句调用没填好都会
  // 抛 NotImplementedError, login 路径 catch 后退回空 token.
  const kexResp = await sendKex(client, pubOctet)
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

// ---- 三步握手 stub ---------------------------------------------------------
//
// 已知 (来自 LuckyLillia.Sign/traces/sso_dump_20260608-135044.jsonl):
//
// SsoKeyExchange request 196B PB:
//   field 1 LEN 65 : client P-256 pub octet (0x04 || X(32) || Y(32))
//   field 2 VARINT : 1 (constant, possibly version)
//   field 3 LEN 57 : opaque blob (12 IV + 29 ct + 16 tag), key 来源未知
//   field 4 VARINT : unix sec timestamp
//   field 5 LEN 60 : opaque blob (12 IV + 32 ct + 16 tag), 同上
//
// SsoEstablishShareKey request 1489B PB:
//   field 1 LEN 8    : "getToken" ASCII
//   field 2 LEN 33   : 0x02 || X(32) compressed P-256 (另一个 keypair?)
//   field 4 LEN 66   : ASCII hex of field 2 (冗余)
//   field 5 LEN 1339 : opaque big blob (GCM)
//   field 6 LEN 32   : session id (== SecureAccess.field 3)
//
// SsoSecureAccess request 1353B PB:
//   field 1 LEN 8    : "getToken" ASCII
//   field 2 LEN 1306 : opaque big blob (GCM)
//   field 3 LEN 32   : session id (== ESK.field 6)
//
// Phase 2 实施: SsoKeyExchange request crypto 已**完整逆向**(见 NTQQSign repo
// memory/sso-keyexchange-request-key-derivation.md), 关键常量在下方 EMBEDDED_*. 但
// SsoEstablishShareKey / SsoSecureAccess 的 GCM key 来源还没逆 (推测 share-key,
// 等 SsoKeyExchange 跑通后再 hook 验证).
// 详细 schema 在 NTQQSign repo 的 sso-request-pb-schema memory 里.

// 嵌入在 wrapper.node 里的 server P-256 公钥 (uncompressed octet, 65B), 解码自
// xmmword_ACEB5B/6B/7B/8B + 0xE8 (SSE swap-nibbles + sequential XOR 混淆).
// SsoKeyExchange field 3 GCM blob 的 key = ECDH(client_priv, EMBEDDED_SERVER_PUB).
const EMBEDDED_SERVER_PUB_HEX =
  '049d1423332735980edabe7e9ea451b3395b6f35250db8fc56f25889f628cbae' +
  '3e8e73077914071eeebc108f4e0170057792bb17aa303af652313d17c1ac815e79'

// 嵌入的 32B AES-256-GCM key, 解码自 xmmword_A13990 + xmmword_A139A0.
// SsoKeyExchange field 5 GCM blob 的 key = EMBEDDED_KEY32.
// blob5 plaintext = SHA256(client_pub || u32_LE(0x01000000) || blob3_full || u64_BE(ts))
const EMBEDDED_KEY32_HEX =
  'e2733bf403149913cbf80c7a95168bd4ca6935ee53cd39764beebe2e007e3aee'

async function sendKex(_client: DirectProtocolClient, _clientPub: Buffer): Promise<Buffer> {
  // TODO Phase 2.1: 实装 SsoKeyExchange request 构造
  //   1. share_key = ecdh.computeSecret(EMBEDDED_SERVER_PUB) -- raw X 32B no KDF
  //   2. v68_inner = pb.encode({
  //        f1 LEN: uin_string,        // "123456789"
  //        f2 LEN: machine_guid_16B   // sub_76D5D70 持久化文件; Bot 端可生成 16B random
  //                                      并存到 data/machine_guid.bin 一致使用
  //      })
  //   3. blob3 = randomIV(12) || AES-256-GCM(v68, share_key, iv).enc.tag
  //   4. v39 = client_pub_octet || u32_LE(0x01000000) || blob3 || u64_BE(unix_ts)
  //   5. blob5 = randomIV(12) || AES-256-GCM(sha256(v39), EMBEDDED_KEY32, iv).enc.tag
  //   6. body = pb.encode({ f1: client_pub, f2: 1, f3: blob3, f4: ts, f5: blob5 })
  //   7. await client.sendCommand('trpc.login.ecdh.EcdhService.SsoKeyExchange', body)
  //   8. return resp.body  // ~308B
  void EMBEDDED_SERVER_PUB_HEX; void EMBEDDED_KEY32_HEX
  throw new NotImplementedError('SsoKeyExchange request: 完整公式已逆向, 待实装 (见上方注释)')
}

async function sendEstablishShareKey(
  _client: DirectProtocolClient,
  _privKey: Buffer,
  _clientPub: Buffer,
  _kexResp: Buffer,
): Promise<Buffer> {
  throw new NotImplementedError('SsoEstablishShareKey request: field 5 (1339B) GCM key 待逆向')
}

async function sendSecureAccess(
  _client: DirectProtocolClient,
  _privKey: Buffer,
  _clientPub: Buffer,
  _kexResp: Buffer,
): Promise<Buffer> {
  throw new NotImplementedError('SsoSecureAccess request: field 2 (1306B) GCM key 待逆向')
}
