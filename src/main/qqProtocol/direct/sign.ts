export interface SignResult {
  sign: Buffer
  token: Buffer
  extra: Buffer
}

export async function requestSign(
  signUrl: string,
  cmd: string,
  src: Buffer,
  seq: number,
  guid?: Buffer,
): Promise<SignResult | null> {
  try {
    const url = signUrl.endsWith('/') ? signUrl + 'api/sign/sec-sign' : signUrl + '/api/sign/sec-sign'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: cmd,
        body: src.toString('hex'),
        seq,
        // sign server 接收 32 字符 hex（= 16B raw 的 hex 形式），跟 SSO 包头里的 guid 字符串一致
        ...(guid ? { guid: guid.toString('hex') } : {}),
      }),
    })
    const json = await res.json() as { code: number; value: { sign: string; extra: string; token: string; sec_sign?: string; sec_token?: string; sec_extra?: string } }
    if (json.code !== 0) return null
    const v = json.value
    return {
      sign: Buffer.from(v.sec_sign || v.sign || '', 'hex'),
      token: Buffer.from(v.sec_token || v.token || '', 'hex'),
      extra: Buffer.from(v.sec_extra || v.extra || '', 'hex'),
    }
  } catch (e) {
    console.error('[Sign] Failed:', (e as Error).message)
    return null
  }
}
