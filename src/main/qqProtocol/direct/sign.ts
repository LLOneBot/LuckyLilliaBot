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
  }

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch (e) {
    console.error(`[Sign] Network error to ${url}:`, (e as Error).message)
    return null
  }

  // 出错路径: 把 manager-server 的 message 抓出来打
  if (!res.ok) {
    const detail = await readErrorMessage(res)
    switch (res.status) {
      case 401:
        console.error(`[Sign] Unauthorized (cmd=${cmd}): ${detail}. signToken 无效或已撤销, 到 manager-web 重新生成`)
        break
      case 403:
        console.error(`[Sign] Forbidden (cmd=${cmd}): ${detail}. 当前 QQ 不在 token 的 uin 白名单, 到 manager-web 添加`)
        break
      case 502:
        console.error(`[Sign] Bad Gateway (cmd=${cmd}): ${detail}. 上游 sign-service 进程不可用 (manager 调它失败)`)
        break
      case 503:
        console.error(`[Sign] Service Unavailable (cmd=${cmd}): ${detail}. manager 没匹配的 sign 后端 (qua=${qua ?? '<empty>'}), 到管理面 "Sign 后端" 加规则`)
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

export async function preflightSign(
  signUrl: string,
  signToken: string,
  qua: string,
  logger: PreflightLogger,
): Promise<string | null> {
  const url = signUrl.endsWith('/') ? signUrl + 'api/sign/sec-sign' : signUrl + '/api/sign/sec-sign'
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${signToken}`,
      },
      body: JSON.stringify({
        command: 'wtlogin.trans_emp',
        body: '00',
        seq: 0,
        qua,
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (e) {
    const msg = (e as Error).message
    logger.error(`[Sign Preflight] 连不上 manager (${url}): ${msg}. 请确认 manager-server 已启动并能从本机访问.`)
    return `cannot reach ${url}: ${msg}`
  }

  if (res.status === 401) {
    const detail = await readErrorMessage(res)
    logger.error(`[Sign Preflight] 401 Unauthorized: ${detail}. signToken 无效或已撤销, 到 manager-web /settings 重新生成并写入 data/sign_token.txt.`)
    return 'token unauthorized'
  }
  if (res.status === 503) {
    const detail = await readErrorMessage(res)
    logger.error(`[Sign Preflight] 503 Service Unavailable: ${detail}. manager 没有匹配 qua=${qua} 的 sign 后端, 到管理面 "Sign 后端" 加一行 (qua_pattern='*' 兜底也行).`)
    return 'no sign backend'
  }
  if (res.status === 502) {
    const detail = await readErrorMessage(res)
    logger.error(`[Sign Preflight] 502 Bad Gateway: ${detail}. 上游 sign-service 进程不可用 (manager 调它失败). 检查 sign-service 是否启动.`)
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
      logger.error(`[Sign Preflight] manager 返回 code=${json.code}, sign 链路不可用`)
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
