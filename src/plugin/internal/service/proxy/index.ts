import { Context } from 'cordis'
import { Hono } from 'hono'
import { ProxyAgent } from 'undici'
import type { HttpConfig } from '@luckylillia/plugin-sdk'
import { proxyUrlProblem, ProxySchema, type ProxySettings } from './settings'

/** Answers 204 when it is reachable: the usual test that a proxy gets out */
export const DEFAULT_TEST_URL = 'https://www.google.com/generate_204'

/** Loopback and private-network hosts: a proxy elsewhere cannot reach them, so the address set here skips them */
export function isLocal(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true
  const ip = host.split('.').map(Number)
  if (ip.length !== 4 || ip.some(part => !Number.isInteger(part))) return false
  const [a, b] = ip
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

function withoutPassword(url: string): string {
  const parsed = new URL(url)
  if (parsed.password) parsed.password = '***'
  return parsed.href.replace(/\/$/, '')
}

/** "fetch failed" says nothing: the reason is down its cause chain (ECONNREFUSED, a refused CONNECT...) */
function reasonOf(error: unknown): string {
  const messages: string[] = []
  for (let cause = error as { message?: string; code?: string; cause?: unknown } | undefined; cause; cause = cause.cause as typeof cause) {
    const text = cause.code && !cause.message?.includes(cause.code) ? `${cause.message} (${cause.code})` : cause.message
    if (text) messages.push(text)
  }
  return messages.at(-1) ?? String(error)
}

/**
 * The settings page's test, with the address its form holds, saved or not. It sets up that proxy itself rather
 * than going through the entry, so an address can be tried before the entry is switched on, and a local test
 * address goes through it too.
 */
export function createProxyRoutes(): Hono {
  const routes = new Hono()
  routes.post('/proxy/test', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { url?: unknown; proxyAgent?: unknown }
    const target = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : DEFAULT_TEST_URL
    if (!/^https?:\/\//.test(target)) return c.json({ success: false, message: '测试地址要以 http:// 或 https:// 开头' }, 400)
    const address = typeof body.proxyAgent === 'string' ? body.proxyAgent.trim() : ''
    const problem = proxyUrlProblem(address)
    if (problem) return c.json({ success: false, message: `代理地址${problem}` }, 400)
    const agent = address ? new ProxyAgent(address) : undefined
    const proxy = address ? withoutPassword(address) : ''
    const started = Date.now()
    try {
      // Node's fetch takes undici's `dispatcher`, which RequestInit does not declare
      const response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(15_000), dispatcher: agent } as RequestInit)
      await response.body?.cancel()
      return c.json({ success: true, data: { ok: true, status: response.status, latency: Date.now() - started, proxy } })
    } catch (e) {
      return c.json({ success: true, data: { ok: false, error: reasonOf(e), latency: Date.now() - started, proxy } })
    } finally {
      agent?.close().catch(() => {})
    }
  })
  return routes
}

/** The standby part of builtin:proxy: the settings page tries an address before the entry is switched on */
export const ProxyTestRoutes = {
  name: 'webui-proxy-routes',
  inject: ['webuiServer'],
  apply(ctx: Context) {
    ctx.webuiServer.route('/api/proxy', new Hono().route('/api', createProxyRoutes()))
  },
}

export const name = 'proxy'
export const Config = ProxySchema

/**
 * Puts a proxy into the requests of `ctx.http`: the one a request names (`proxyAgent`, `''` for none), else the
 * address set here. Plain fetch() never passes here, so the bot's own connections stay direct. undici's ProxyAgent
 * covers http, https and socks5 proxies; one per address, so connections to a proxy are reused.
 */
export function apply(ctx: Context, config: ProxySettings) {
  const agents = new Map<string, ProxyAgent>()
  const addressOf = (url: URL, http: HttpConfig): string => {
    const address = http.proxyAgent ?? (isLocal(url) ? '' : config.proxyAgent)
    if (!address) return ''
    // Native clients and fetch must agree. Never expose a credential-bearing URL in validation errors.
    if (typeof address !== 'string' || proxyUrlProblem(address)) throw new Error('Invalid proxy address')
    try {
      const parsed = new URL(address)
      decodeURIComponent(parsed.username)
      decodeURIComponent(parsed.password)
    } catch { throw new Error('Invalid proxy address') }
    return address
  }
  ctx.effect(() => () => {
    for (const agent of agents.values()) agent.close().catch(() => {})
    agents.clear()
  })

  ctx.on('http/proxy', (url, proxy, http) => {
    proxy.url = addressOf(url, http)
  })

  ctx.on('http/fetch-init', (url, init, http) => {
    const address = addressOf(url, http)
    if (!address) return
    let agent = agents.get(address)
    if (!agent) agents.set(address, agent = new ProxyAgent(address))
    init.dispatcher = agent
  })
}
