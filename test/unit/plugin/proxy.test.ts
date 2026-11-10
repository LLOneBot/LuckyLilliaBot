import { createServer as createHttpServer, Server } from 'node:http'
import { AddressInfo, connect, createServer, Socket } from 'node:net'
import { Context } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Proxy from '@/plugin/internal/service/proxy'
import { proxySettings } from '@/plugin/internal/service/proxy/settings'
import HttpService from '@/universal/http'
import { startConnectProxy } from '../examples/fakeAi'

let target: Server
let port: number
/** Only a proxy reaches it (they all tunnel to 127.0.0.1); going direct fails on the name */
let far: string
/** Reached directly: local, so the address set in the builtin proxy skips it */
let near: string
let hits: string[]
let ctx: Context

/** A SOCKS5 server without authentication, enough for CONNECT; like startConnectProxy, it ends at 127.0.0.1 */
async function startSocks5() {
  const targets: string[] = []
  const server = createServer((client: Socket) => {
    client.once('data', () => {
      client.write(Buffer.from([5, 0]))
      client.once('data', (request) => {
        let host: string
        let offset: number
        if (request[3] === 1) {
          host = [...request.subarray(4, 8)].join('.')
          offset = 8
        } else {
          host = request.subarray(5, 5 + request[4]).toString()
          offset = 5 + request[4]
        }
        const port = request.readUInt16BE(offset)
        targets.push(`${host}:${port}`)
        const upstream = connect(port, '127.0.0.1', () => {
          client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]))
          upstream.pipe(client)
          client.pipe(upstream)
        })
        upstream.on('error', () => client.destroy())
      })
    })
    client.on('error', () => {})
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `socks5://127.0.0.1:${(server.address() as AddressInfo).port}`,
    targets,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

const text = (url: string, config?: { proxyAgent?: string }) => ctx.http.get<string>(url, { responseType: 'text', ...config })

beforeEach(async () => {
  hits = []
  target = createHttpServer((request, response) => {
    hits.push(request.url!)
    response.writeHead(request.url === '/204' ? 204 : 200)
    response.end(request.url === '/204' ? undefined : 'hello')
  })
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  port = (target.address() as AddressInfo).port
  far = `http://far.invalid:${port}`
  near = `http://127.0.0.1:${port}`
  ctx = new Context()
  await ctx.plugin(HttpService)
})

afterEach(async () => {
  await ctx.registry.delete(Proxy)
  await ctx.registry.delete(HttpService)
  target.closeAllConnections()
  await new Promise(resolve => target.close(resolve))
})

describe('the builtin proxy', () => {
  it('resolves native clients with the same default, local bypass, overrides and disabled state', async () => {
    const address = 'http://127.0.0.1:9'
    const override = 'socks5://127.0.0.1:10'
    const fetchHook = vi.fn()
    ctx.on('http/fetch-init', fetchHook)
    expect(ctx.http.proxy(far, { proxyAgent: address })).toBe('')
    await ctx.plugin(Proxy, { proxyAgent: address })
    expect(ctx.http.proxy(far)).toBe(address)
    expect(ctx.http.proxy(near)).toBe('')
    expect(ctx.http.proxy(far, { proxyAgent: '' })).toBe('')
    expect(ctx.http.proxy(near, { proxyAgent: override })).toBe(override)
    const extended = ctx.http.extend({ baseURL: far, proxyAgent: override })
    expect(extended.proxy('/resource')).toBe(override)
    expect(extended.proxy('/resource', { proxyAgent: '' })).toBe('')
    await ctx.registry.delete(Proxy)
    expect(extended.proxy('/resource')).toBe('')
    await ctx.plugin(Proxy, { proxyAgent: '' })
    expect(ctx.http.proxy(far)).toBe('')
    expect(extended.proxy('/resource')).toBe(override)
    expect(fetchHook).not.toHaveBeenCalled()
    expect(hits).toEqual([])
  })

  it('preserves native proxy authentication privately and rejects malformed addresses without a fallback', async () => {
    const address = new URL('https://127.0.0.1:9')
    address.username = 'fixture:user'
    address.password = 'fixture password'
    await ctx.plugin(Proxy, { proxyAgent: address.href })
    // Compare booleans so even a failing assertion cannot print authentication values.
    expect(ctx.http.proxy(far) === address.href).toBe(true)
    const invalid = 'http://fixture:never-print@exa mple:9'
    expect(() => ctx.http.proxy(far, { proxyAgent: invalid })).toThrow('Invalid proxy address')
    expect(() => ctx.http.proxy(far, { proxyAgent: 'http://fixture:%ZZ@127.0.0.1:9' })).toThrow('Invalid proxy address')
    expect(() => ctx.http.proxy(far, { proxyAgent: 'ftp://127.0.0.1:9' })).toThrow('Invalid proxy address')
    await expect(text(far, { proxyAgent: invalid })).rejects.toThrow('Invalid proxy address')
    await ctx.registry.delete(Proxy)
    await ctx.plugin(Proxy, { proxyAgent: invalid })
    expect(() => ctx.http.proxy(far)).toThrow('Invalid proxy address')
    expect(hits).toEqual([])
  })

  it('takes http, https and socks5 addresses, or none', () => {
    const issues = (proxyAgent: string) => proxySettings.check!(proxySettings.normalize!({ proxyAgent }), true)
    expect(issues('')).toEqual([])
    expect(issues(' http://127.0.0.1:7890 ')).toEqual([])
    expect(issues('socks5://user:pass@127.0.0.1:1080')).toEqual([])
    expect(issues('127.0.0.1:7890')).toEqual([{ path: ['proxyAgent'], message: '要以 http://、https:// 或 socks5:// 开头' }])
    expect(issues('ftp://127.0.0.1:21')).toEqual([{ path: ['proxyAgent'], message: '要以 http://、https:// 或 socks5:// 开头' }])
    expect(issues('http://exa mple:80')).toEqual([{ path: ['proxyAgent'], message: '这不是一个地址' }])
  })

  it('tells local hosts', () => {
    const local = (url: string) => Proxy.isLocal(new URL(url))
    for (const url of ['http://localhost:11434', 'http://127.0.0.1', 'http://[::1]:80', 'http://10.1.2.3', 'http://172.16.0.1', 'http://192.168.1.10', 'http://app.localhost']) {
      expect(local(url), url).toBe(true)
    }
    for (const url of ['https://api.openai.com', 'http://172.32.0.1', 'http://8.8.8.8', 'http://192.169.0.1', 'http://10.example.com']) {
      expect(local(url), url).toBe(false)
    }
  })

  it('leaves ctx.http alone without an address', async () => {
    await ctx.plugin(Proxy, { proxyAgent: '' })
    expect(await text(`${near}/x`)).toBe('hello')
    await expect(text(`${far}/x`)).rejects.toMatchObject({ name: 'HttpError', code: 'ENOTFOUND' })
    expect(hits).toEqual(['/x'])
  })

  it('puts its address into ctx.http, past local hosts and requests going direct, never into plain fetch()', async () => {
    const proxy = await startConnectProxy()
    try {
      const url = new URL(proxy.url)
      url.username = 'me'
      url.password = 'secret'
      await ctx.plugin(Proxy, { proxyAgent: url.href })
      expect(await text(`${far}/via`)).toBe('hello')
      expect(proxy.tunnels).toEqual([{ target: `far.invalid:${port}`, authorization: `Basic ${Buffer.from('me:secret').toString('base64')}` }])
      expect(await text(`${near}/local`)).toBe('hello')
      await expect(text(`${far}/direct`, { proxyAgent: '' })).rejects.toMatchObject({ code: 'ENOTFOUND' })
      await expect(ctx.http.extend({ proxyAgent: '' }).get(`${far}/direct`)).rejects.toMatchObject({ code: 'ENOTFOUND' })
      await expect(fetch(`${far}/plain`)).rejects.toThrow()
      expect(proxy.tunnels).toHaveLength(1)
      expect(hits).toEqual(['/via', '/local'])
    } finally {
      await proxy.close()
    }
  })

  it('takes the address a request names, without itself having one', async () => {
    const proxy = await startConnectProxy()
    try {
      await ctx.plugin(Proxy, { proxyAgent: '' })
      const client = ctx.http.extend({ proxyAgent: proxy.url })
      expect(await client.get(`${far}/named`, { responseType: 'text' })).toBe('hello')
      // Named, it applies to local hosts too
      expect(await client.get(`${near}/named-local`, { responseType: 'text' })).toBe('hello')
      expect(proxy.tunnels.map(tunnel => tunnel.target)).toEqual([`far.invalid:${port}`, `127.0.0.1:${port}`])
      // An address no proxy can be made of fails the request instead of letting it go out directly
      await expect(text(`${near}/bad`, { proxyAgent: 'nonsense' })).rejects.toThrow()
      expect(hits).toEqual(['/named', '/named-local'])
    } finally {
      await proxy.close()
    }
  })

  it('goes through a socks5 proxy', async () => {
    const socks = await startSocks5()
    try {
      await ctx.plugin(Proxy, { proxyAgent: socks.url })
      expect(await text(`${far}/socks`)).toBe('hello')
      expect(socks.targets).toEqual([`far.invalid:${port}`])
    } finally {
      await socks.close()
    }
  })

  it('stops when switched off', async () => {
    const proxy = await startConnectProxy()
    try {
      await ctx.plugin(Proxy, { proxyAgent: proxy.url })
      expect(await text(`${far}/on`)).toBe('hello')
      await ctx.registry.delete(Proxy)
      await expect(text(`${far}/off`)).rejects.toMatchObject({ code: 'ENOTFOUND' })
      expect(proxy.tunnels).toHaveLength(1)
    } finally {
      await proxy.close()
    }
  })

  it('tests the address its settings page holds, saved or not, with the entry off too', async () => {
    const proxy = await startConnectProxy()
    try {
      const routes = Proxy.createProxyRoutes()
      const test = async (body: unknown) => {
        const response = await routes.request('/proxy/test', { method: 'POST', body: JSON.stringify(body) })
        return { status: response.status, ...await response.json() as { data?: any; message?: string } }
      }
      // Through the proxy even to a local address
      expect(await test({ url: `${near}/204`, proxyAgent: proxy.url })).toMatchObject({ status: 200, data: { ok: true, status: 204, proxy: proxy.url } })
      expect(await test({ url: `${far}/204`, proxyAgent: proxy.url })).toMatchObject({ data: { ok: true, status: 204 } })
      expect(proxy.tunnels.map(tunnel => tunnel.target)).toEqual([`127.0.0.1:${port}`, `far.invalid:${port}`])
      // No address: straight there
      expect(await test({ url: `${near}/204`, proxyAgent: '' })).toMatchObject({ data: { ok: true, status: 204, proxy: '' } })
      expect(proxy.tunnels).toHaveLength(2)
      const closed = new URL(near)
      closed.port = '9'
      expect(await test({ url: closed.href, proxyAgent: proxy.url })).toMatchObject({ data: { ok: false, error: expect.any(String) } })
      expect(await test({ url: 'ftp://x' })).toMatchObject({ status: 400 })
      expect(await test({ proxyAgent: '127.0.0.1:7890' })).toMatchObject({ status: 400, message: expect.stringContaining('http://') })
    } finally {
      await proxy.close()
    }
  })
})
