import { createServer, IncomingHttpHeaders, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { Context } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HttpConfig, HttpFetchInit } from '@luckylillia/plugin-sdk'
import HttpService from '@/universal/http'
import { PNG } from '../examples/fakeAi'

interface Seen {
  method: string
  url: string
  headers: IncomingHttpHeaders
  body: string
}

let server: Server
let base: string
let seen: Seen[]
let ctx: Context

beforeEach(async () => {
  seen = []
  server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      seen.push({ method: request.method!, url: request.url!, headers: request.headers, body: Buffer.concat(chunks).toString() })
      const path = request.url!.split('?')[0]
      if (path === '/json') return response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end('{"a":1}')
      if (path === '/text') return response.writeHead(200, { 'content-type': 'text/plain' }).end('plain')
      if (path === '/bytes') return response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(PNG)
      if (path === '/named') {
        return response.writeHead(200, { 'content-type': 'image/png', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent('图.png')}` }).end(PNG)
      }
      if (path === '/missing') return response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"no such thing"}')
      if (path === '/broken') return response.writeHead(502, { 'content-type': 'application/json' }).end('<html>bad gateway</html>')
      if (path === '/slow') return setTimeout(() => response.writeHead(200).end('late'), 2000)
      response.writeHead(200, { 'content-type': 'text/plain' }).end(`${request.method} ${request.url}`)
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  ctx = new Context()
  await ctx.plugin(HttpService)
})

afterEach(async () => {
  await ctx.registry.delete(HttpService)
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
})

describe('ctx.http', () => {
  it('resolves native proxy settings synchronously without issuing a request or calling fetch hooks', () => {
    const fetchHook = vi.fn()
    ctx.on('http/fetch-init', fetchHook)
    expect(ctx.http.proxy(`${base}/plain`, { proxyAgent: 'http://127.0.0.1:9' })).toBe('')
    const calls: { url: string; config: HttpConfig }[] = []
    ctx.on('http/proxy', (url, proxy, config) => {
      calls.push({ url: url.href, config })
      expect(proxy.url).toBe('')
      proxy.url = config.proxyAgent ?? ''
    })
    const client = ctx.http.extend({ baseURL: `${base}/api`, proxyAgent: 'http://127.0.0.1:9',
      headers: { 'x-a': '1', 'x-b': '1' }, timeout: 1000 })
    expect(client.proxy('native', { headers: { 'x-b': '2' } })).toBe('http://127.0.0.1:9')
    expect(client.proxy('other', { baseURL: `${base}/v2`, proxyAgent: '' })).toBe('')
    expect(client.proxy(new URL(`${base}/absolute`), { timeout: 2000 })).toBe('http://127.0.0.1:9')
    expect(calls).toEqual([
      { url: `${base}/api/native`, config: { baseURL: `${base}/api`, proxyAgent: 'http://127.0.0.1:9',
        headers: { 'x-a': '1', 'x-b': '2' }, timeout: 1000 } },
      { url: `${base}/v2/other`, config: { baseURL: `${base}/v2`, proxyAgent: '',
        headers: { 'x-a': '1', 'x-b': '1' }, timeout: 1000 } },
      { url: `${base}/absolute`, config: { baseURL: `${base}/api`, proxyAgent: 'http://127.0.0.1:9',
        headers: { 'x-a': '1', 'x-b': '1' }, timeout: 2000 } },
    ])
    expect(fetchHook).not.toHaveBeenCalled()
    expect(seen).toEqual([])
  })

  it('reads answers by their type, or as told', async () => {
    expect(await ctx.http.get(`${base}/json`)).toEqual({ a: 1 })
    expect(await ctx.http.get(`${base}/text`)).toBe('plain')
    const bytes = await ctx.http.get(`${base}/bytes`)
    expect(bytes).toBeInstanceOf(ArrayBuffer)
    expect(Buffer.from(bytes).equals(PNG)).toBe(true)
    expect(await ctx.http.get(`${base}/json`, { responseType: 'text' })).toBe('{"a":1}')
    expect(await ctx.http.get(`${base}/text`, { responseType: 'arraybuffer' })).toBeInstanceOf(ArrayBuffer)
    const response = await ctx.http.request('GET', `${base}/json`)
    expect(response).toMatchObject({ status: 200, data: { a: 1 } })
    expect(response.headers.get('content-type')).toContain('application/json')
    expect((await ctx.http.head(`${base}/text`)).get('content-type')).toBe('text/plain')
  })

  it('sends objects as JSON and anything else as it is, with the query, base URL and headers given', async () => {
    const client = ctx.http.extend({ baseURL: `${base}/api/`, headers: { 'x-a': '1', 'x-b': '1' } })
    expect(client.extend({ timeout: 1 }).config).toMatchObject({ baseURL: `${base}/api/`, timeout: 1 })
    await client.post('items', { name: '名' }, { params: { q: 'a b', skip: undefined, n: 2 }, headers: { 'x-b': '2' } })
    await client.put('/raw', 'just text')
    await ctx.http.extend({ baseURL: `${base}/v1` }).patch('models', new URLSearchParams({ k: 'v' }))
    await ctx.http.delete(`${base}/gone`)
    expect(seen.map(({ method, url, body }) => ({ method, url, body }))).toEqual([
      { method: 'POST', url: '/api/items?q=a+b&n=2', body: '{"name":"名"}' },
      { method: 'PUT', url: '/raw', body: 'just text' },
      { method: 'PATCH', url: '/v1/models', body: 'k=v' },
      { method: 'DELETE', url: '/gone', body: '' },
    ])
    expect(seen[0].headers).toMatchObject({ 'content-type': 'application/json', 'x-a': '1', 'x-b': '2' })
    expect(seen[1].headers['content-type']).toBe('text/plain;charset=UTF-8')
  })

  it('throws HttpError for answers that are not 2xx and for no answer at all', async () => {
    await expect(ctx.http.get(`${base}/missing?key=secret`)).rejects.toMatchObject({
      name: 'HttpError',
      message: `GET ${base}/missing answered 404`,
      response: { status: 404, data: { error: 'no such thing' } },
    })
    // A body that is not the JSON it claims to be still tells what went wrong
    await expect(ctx.http.get(`${base}/broken`)).rejects.toMatchObject({ response: { status: 502, data: '<html>bad gateway</html>' } })
    await expect(ctx.http.get(`${base}/broken`, { responseType: 'json' })).rejects.toMatchObject({ response: { status: 502 } })
    const closed = createServer()
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
    const port = (closed.address() as AddressInfo).port
    await new Promise(resolve => closed.close(resolve))
    await expect(ctx.http.get(`http://127.0.0.1:${port}/`)).rejects.toMatchObject({ name: 'HttpError', code: 'ECONNREFUSED' })
    // fetch() hands over the answer whatever its status
    expect((await ctx.http.fetch(`${base}/missing`)).status).toBe(404)
  })

  it('gives up after the timeout, and leaves the caller its own abort', async () => {
    await expect(ctx.http.get(`${base}/slow`, { timeout: 100 })).rejects.toMatchObject({ name: 'HttpError', code: 'ETIMEDOUT' })
    const controller = new AbortController()
    const reason = new Error('mine')
    setTimeout(() => controller.abort(reason), 100)
    await expect(ctx.http.get(`${base}/slow`, { signal: controller.signal, timeout: 10_000 })).rejects.toBe(reason)
  })

  it('downloads files with their type and name', async () => {
    expect(await ctx.http.file(`${base}/named`)).toMatchObject({ type: 'image/png', filename: '图.png' })
    // application/octet-stream says nothing: the bytes do
    const file = await ctx.http.file(`${base}/bytes`)
    expect(file).toMatchObject({ type: 'image/png', filename: 'bytes' })
    expect(Buffer.from(file.data).equals(PNG)).toBe(true)
    const inline = await ctx.http.file(`data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}`)
    expect(inline.type).toBe('image/gif')
    expect(Buffer.from(inline.data).toString()).toBe('GIF89a')
    const note = await ctx.http.file('data:text/plain,a%20b')
    expect(note.type).toBe('text/plain')
    expect(Buffer.from(note.data).toString()).toBe('a b')
  })

  it('passes every request by http/fetch-init with the settings it goes by, and plain fetch() never', async () => {
    const calls: { url: string; config: HttpConfig }[] = []
    ctx.on('http/fetch-init', (url: URL, init: HttpFetchInit, config: HttpConfig) => {
      calls.push({ url: url.href, config })
      ;(init.headers as Headers).set('x-hooked', '1')
    })
    await ctx.http.extend({ proxyAgent: 'http://p:1', headers: { 'x-a': '1' } }).get(`${base}/one`, { proxyAgent: '', timeout: 5000 })
    await ctx.http.fetch(`${base}/two`, { headers: { 'x-b': '2' } }, { proxyAgent: 'http://q:2' })
    await fetch(`${base}/plain`)
    expect(calls).toEqual([
      { url: `${base}/one`, config: { proxyAgent: '', headers: { 'x-a': '1' }, timeout: 5000 } },
      { url: `${base}/two`, config: { proxyAgent: 'http://q:2' } },
    ])
    expect(seen.map(call => [call.url, call.headers['x-hooked']])).toEqual([['/one', '1'], ['/two', '1'], ['/plain', undefined]])
    expect(seen[0].headers['x-a']).toBe('1')
    expect(seen[1].headers['x-b']).toBe('2')
  })
})
