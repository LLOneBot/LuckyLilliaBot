import { createServer, IncomingHttpHeaders, Server } from 'node:http'
import { AddressInfo, connect, Socket } from 'node:net'

export interface FakeCall {
  method: string
  path: string
  headers: IncomingHttpHeaders
  raw: Buffer
  /** The body parsed as JSON, when it is */
  json?: any
}

export interface FakeAnswer {
  status?: number
  json?: unknown
  /** Server-sent events: each string goes out as one `data:` line */
  sse?: string[]
  /** Milliseconds before each event */
  interval?: number
  /** Leaves the event stream open after the last event, as a stalled provider would */
  hold?: boolean
  body?: Buffer
  type?: string
  /** Milliseconds before answering */
  delay?: number
  /** Closes the connection instead of answering */
  drop?: boolean
}

/** An OpenAI-compatible API on a free local port: `answer` decides what each request gets */
export async function startFakeAi(answer: (call: FakeCall) => FakeAnswer | undefined) {
  const calls: FakeCall[] = []
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', async () => {
      const raw = Buffer.concat(chunks)
      let json: unknown
      try {
        json = raw.length ? JSON.parse(raw.toString()) : undefined
      } catch {
        json = undefined
      }
      const call: FakeCall = { method: request.method!, path: request.url!, headers: request.headers, raw, json }
      calls.push(call)
      const reply = answer(call) ?? { status: 404, json: { error: { message: `no route for ${call.path}` } } }
      if (reply.delay) await new Promise(resolve => setTimeout(resolve, reply.delay))
      if (response.destroyed) return
      if (reply.drop) {
        request.socket.destroy()
        return
      }
      if (reply.sse) {
        response.writeHead(reply.status ?? 200, { 'content-type': 'text/event-stream' })
        for (const data of reply.sse) {
          if (reply.interval) await new Promise(resolve => setTimeout(resolve, reply.interval))
          if (response.destroyed) return
          response.write(`data: ${data}\n\n`)
        }
        if (!reply.hold) response.end()
        return
      }
      if (reply.body) {
        response.writeHead(reply.status ?? 200, { 'content-type': reply.type ?? 'application/octet-stream' })
        response.end(reply.body)
        return
      }
      response.writeHead(reply.status ?? 200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(reply.json ?? {}))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    url,
    calls,
    close: () => new Promise<void>(resolve => {
      server.closeAllConnections()
      server.close(() => resolve())
    }),
  }
}

export interface Tunnel {
  /** host:port asked for */
  target: string
  authorization?: string
}

/**
 * An HTTP proxy that tunnels CONNECT requests, as undici's ProxyAgent sends them for http and https alike. Every tunnel
 * ends at 127.0.0.1, so tests can name a host only the proxy reaches (`ai.invalid`): the address set in the builtin
 * proxy skips local ones.
 */
export async function startConnectProxy() {
  const tunnels: Tunnel[] = []
  const server = createServer((_request, response) => {
    response.writeHead(405)
    response.end()
  })
  server.on('connect', (request, client: Socket, head: Buffer) => {
    tunnels.push({ target: request.url!, authorization: request.headers['proxy-authorization'] })
    const port = Number(request.url!.split(':').pop())
    const upstream = connect(port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
    upstream.on('error', () => client.destroy())
    client.on('error', () => upstream.destroy())
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    tunnels,
    close: () => new Promise<void>(resolve => {
      server.closeAllConnections()
      server.close(() => resolve())
    }),
  }
}

/** What /chat/completions answers with `content` as the reply */
export function completion(content: string | null, model = 'fake-model') {
  return {
    id: 'chatcmpl-1',
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 3 },
  }
}

export const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex')
