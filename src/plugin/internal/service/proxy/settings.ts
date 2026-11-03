import Schema from 'schemastery'
import type { BuiltinConfig } from '../../../host'

export interface ProxySettings {
  proxyAgent: string
}

const PROTOCOLS = ['http:', 'https:', 'socks5:', 'socks:']

export const ProxySchema: Schema<ProxySettings> = Schema.object({
  proxyAgent: Schema.string().default('').description(
    '代理地址，比如 http://127.0.0.1:7890（Clash、v2rayN 这类）或 socks5://127.0.0.1:1080；'
    + '要账号密码就写成 http://用户名:密码@地址:端口。留空就是不走代理',
  ),
})

/** What is wrong with an address as a proxy; undefined for a good one or none */
export function proxyUrlProblem(url: string): string | undefined {
  if (!url) return
  const scheme = '要以 http://、https:// 或 socks5:// 开头'
  // `127.0.0.1:7890`, the usual slip, does not parse at all
  if (!url.includes('://')) return scheme
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return '这不是一个地址'
  }
  if (!PROTOCOLS.includes(parsed.protocol)) return scheme
}

export const proxySettings: BuiltinConfig<ProxySettings> = {
  normalize: value => ({ ...value, proxyAgent: (value.proxyAgent ?? '').trim() }),
  check(value) {
    const problem = proxyUrlProblem(value.proxyAgent)
    return problem ? [{ path: ['proxyAgent'], message: problem }] : []
  },
}
