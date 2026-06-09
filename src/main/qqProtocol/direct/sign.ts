export interface SignResult {
  sign: Buffer
  token: Buffer
  extra: Buffer
}

interface SignErrResp { code?: number; message?: string }
interface SignOkResp {
  code: number
  value: { sign: string; extra: string; token: string; sec_sign?: string; sec_token?: string; sec_extra?: string }
}

export async function requestSign(
  signUrl: string,
  cmd: string,
  src: Buffer,
  seq: number,
  guid?: Buffer,
  signToken?: string,
  qua?: string,
  uin?: number,
  /**
   * QQ 协议层 12B ASCII sign-token (e.g. "aUIOeuqqqfxm"). sign 算法第一步
   * MD5(token + extra + body) 的 token 输入. 当前 Bot 拿不到 (Phase 1 骨架),
   * 全留空 -- sign-service 端按空 token 算, server 也接受.
   */
  protocolToken12B?: string,
): Promise<SignResult | null> {
  // sign server 现在要求所有 cmd (包括 trans_emp) 都带 client JWT.
  // 没 token 就早 fail, 不浪费一次 HTTP.
  if (!signToken) {
    console.error('[Sign] No signToken configured; set data/sign_token.txt or QQ_SIGN_TOKEN env. All sign requests require auth.')
    return null
  }

  const url = signUrl.endsWith('/') ? signUrl + 'api/sign/sec-sign' : signUrl + '/api/sign/sec-sign'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${signToken}`,
  }
  const body = {
    command: cmd,
    body: src.toString('hex'),
    seq,
    // sign server 接收 32 字符 hex (= 16B raw 的 hex), 跟 SSO 包头里的 guid 字符串一致
    ...(guid ? { guid: guid.toString('hex') } : {}),
    // qua 让 manager-server 路由到对应 sign-service 后端 (不同 NTQQ 版本不同实例)
    ...(qua ? { qua } : {}),
    // uin: server 端校验 token 上下文 (token 里的 uin 白名单要包含这个 uin) 用
    ...(uin ? { uin } : {}),
    // 12B 协议层 token: ASCII 直接转 hex (24 hex chars), sign-service 端 hex 解码
    // 后当 raw 12B 喂给 MD5(token + extra + body). 不带 = 空 token, 跟现状一致.
    ...(protocolToken12B ? { token: Buffer.from(protocolToken12B, 'utf-8').toString('hex') } : {}),
  }

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch (e) {
    console.error(`[Sign] Network error to ${url}:`, (e as Error).message)
    return null
  }

  // 出错路径: 把 sign server 的 message 抓出来打, 并把 signUrl 显式贴出来让用户知道去哪改
  if (!res.ok) {
    const detail = await readErrorMessage(res)
    switch (res.status) {
      case 401:
        console.error(`[Sign] Unauthorized (cmd=${cmd}): ${detail}. signToken 无效或已撤销, 到 ${signUrl} 重新生成`)
        break
      case 403:
        console.error(`[Sign] Forbidden (cmd=${cmd}): ${detail}. 当前 QQ 不在 token 的 uin 白名单, 到 ${signUrl} 添加`)
        break
      case 502:
        console.error(`[Sign] Bad Gateway (cmd=${cmd}): ${detail}. 上游 sign-service 进程不可用 (${signUrl} 调它失败)`)
        break
      case 503:
        console.error(`[Sign] Service Unavailable (cmd=${cmd}): ${detail}. 没有匹配的 sign 后端 (qua=${qua ?? '<empty>'})`)
        break
      default:
        console.error(`[Sign] HTTP ${res.status} (cmd=${cmd}): ${detail}`)
    }
    return null
  }

  let json: SignOkResp
  try {
    json = await res.json() as SignOkResp
  } catch (e) {
    console.error(`[Sign] Failed to parse response (cmd=${cmd}):`, (e as Error).message)
    return null
  }
  if (json.code !== 0) {
    console.error(`[Sign] Server returned non-zero code ${json.code} (cmd=${cmd})`)
    return null
  }
  const v = json.value
  return {
    sign: Buffer.from(v.sec_sign || v.sign || '', 'hex'),
    token: Buffer.from(v.sec_token || v.token || '', 'hex'),
    extra: Buffer.from(v.sec_extra || v.extra || '', 'hex'),
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const j = await res.json() as SignErrResp
    return j.message ?? `code=${j.code ?? 'n/a'}`
  } catch {
    try { return await res.text() } catch { return '<no body>' }
  }
}

/**
 * Preflight: 启动时调一次 sign 服务, 确认 token / 路由 / sign-service 全链路通.
 *
 * 用 wtlogin.trans_emp 作为 canary cmd, 因为它是登录第一步, 服务端必然要支持.
 * 用 1B body 让 sign-service 真跑一次 compute_sign, 而不是探到 HTTP 层就停.
 *
 * 返回 null = 成功; 返回字符串 = 失败原因 (caller 抛 throw 中断启动).
 */
export interface PreflightLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/**
 * 构造一个最小的 wtlogin.login frame 用于 preflight: 只需要前 13 字节布局正确,
 * 让 sign server 能从 body[9..13] 抠到 uin 做 token 上下文校验. ECDH 加密体填 0
 * (sign server 只算 hash, 不解析内容). 这个 buffer 不会发到 QQ server.
 *
 * 跟 login.ts 的 buildWtLoginFrame layout 对齐:
 *   frame[0]    = 0x02 prefix
 *   frame[1..3] = uint16 length
 *   frame[3..5] = 8001
 *   frame[5..7] = cmdId (2064 = wtlogin.login)
 *   frame[7..9] = 0
 *   frame[9..13]= uin (uint32 BE) <- sign server 看这里
 */
function buildPreflightLoginBody(uin: number): Buffer {
  const innerBody = Buffer.alloc(64)
  let off = 0
  innerBody.writeUInt16BE(8001, off); off += 2
  innerBody.writeUInt16BE(2064, off); off += 2  // wtlogin.login cmdId
  innerBody.writeUInt16BE(0, off); off += 2
  innerBody.writeUInt32BE(uin, off); off += 4   // uin in frame[9..13]
  innerBody[innerBody.length - 1] = 0x03

  const frame = Buffer.alloc(1 + 2 + innerBody.length)
  frame.writeUInt8(0x02, 0)
  frame.writeUInt16BE(innerBody.length + 3, 1)
  innerBody.copy(frame, 3)
  return frame
}

export async function preflightSign(
  signUrl: string,
  signToken: string,
  qua: string,
  logger: PreflightLogger,
  uin?: number,
): Promise<string | null> {
  const url = signUrl.endsWith('/') ? signUrl + 'api/sign/sec-sign' : signUrl + '/api/sign/sec-sign'
  // 没拿到 uin 时退回 trans_emp 探活 (扫码阶段, server 不需要 uin); 拿到 uin 就发 wtlogin.login
  // 让 sign server 真按登录路径走一遍 token 上下文校验
  const reqBody = uin
    ? { command: 'wtlogin.login', body: buildPreflightLoginBody(uin).toString('hex'), seq: 0, qua, uin }
    : { command: 'wtlogin.trans_emp', body: '00', seq: 0, qua }
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${signToken}`,
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(5000),
    })
  } catch (e) {
    const msg = (e as Error).message
    logger.error(`[Sign Preflight] 连不上 sign server (${url}): ${msg}.`)
    return `cannot reach ${url}: ${msg}`
  }

  if (res.status === 401) {
    const detail = await readErrorMessage(res)
    logger.error(`[Sign Preflight] 401 Unauthorized: ${detail}. signToken 无效或已撤销, 到 ${signUrl} 重新生成.`)
    return 'token unauthorized'
  }
  if (res.status === 503) {
    const detail = await readErrorMessage(res)
    logger.error(`[Sign Preflight] 503 Service Unavailable: ${detail}. 没有匹配 qua=${qua} 的 sign 后端.`)
    return 'no sign backend'
  }
  if (res.status === 502) {
    const detail = await readErrorMessage(res)
    logger.error(`[Sign Preflight] 502 Bad Gateway: ${detail}. ${signUrl} 上游 sign-service 不可用.`)
    return 'sign-service down'
  }
  if (!res.ok) {
    const detail = await readErrorMessage(res)
    logger.error(`[Sign Preflight] HTTP ${res.status}: ${detail}`)
    return `http ${res.status}`
  }
  try {
    const json = await res.json() as SignOkResp
    if (json.code !== 0) {
      logger.error(`[Sign Preflight] ${signUrl} 返回 code=${json.code}, sign 链路不可用`)
      return `code=${json.code}`
    }
    const sign = json.value?.sec_sign || json.value?.sign
    if (!sign || sign.length !== 64) {
      logger.error(`[Sign Preflight] sign hex 格式错 (len=${sign?.length}), 后端响应畸形`)
      return 'malformed sign'
    }
    return null
  } catch (e) {
    logger.error(`[Sign Preflight] 解响应失败: ${(e as Error).message}`)
    return 'response parse error'
  }
}
