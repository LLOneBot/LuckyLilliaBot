import { Status } from '@satorijs/protocol'
import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CredentialError, QQOfficialApi } from '@/universal/qqofficial/api'
import { Gateway, GatewayHandlers } from '@/universal/qqofficial/gateway'
import type { GatewayPayload } from '@/universal/qqofficial/types'

interface Connection {
  socket: WebSocket
  received: GatewayPayload[]
}

let ctx: Context
let wss: WebSocketServer
let connections: Connection[]
let onConnection: (connection: Connection) => void
let gateway: Gateway | undefined

beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(TimerService)
  connections = []
  onConnection = () => {}
  wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await new Promise(resolve => wss.once('listening', resolve))
  wss.on('connection', (socket) => {
    const connection: Connection = { socket, received: [] }
    socket.on('message', data => connection.received.push(JSON.parse(data.toString())))
    connections.push(connection)
    onConnection(connection)
  })
})

afterEach(async () => {
  gateway?.stop()
  gateway = undefined
  await new Promise(resolve => wss.close(resolve))
})

function fakeApi(request?: () => Promise<unknown>) {
  const { port } = wss.address() as { port: number }
  return {
    request: vi.fn(request ?? (async () => ({ url: `ws://127.0.0.1:${port}` }))),
    accessToken: vi.fn(async () => 'tok'),
    invalidateToken: vi.fn(),
  }
}

function handlers() {
  const statuses: Status[] = []
  const events: GatewayPayload[] = []
  const value: GatewayHandlers = {
    ready: vi.fn(),
    dispatch: payload => events.push(payload),
    status: status => statuses.push(status),
  }
  return { value, statuses, events }
}

function start(api: ReturnType<typeof fakeApi>, events: GatewayHandlers) {
  gateway = new Gateway(ctx, api as unknown as QQOfficialApi, 1 << 25, events, [10, 20])
  gateway.start()
  return gateway
}

const send = (connection: Connection, payload: object) => connection.socket.send(JSON.stringify(payload))
const hello = (connection: Connection, interval = 60_000) => send(connection, { op: 10, d: { heartbeat_interval: interval } })
const ready = (connection: Connection) => send(connection, { op: 0, s: 1, t: 'READY', d: { session_id: 'S1', user: { id: 'B', username: 'bot' } } })
const lastOp = (connection: Connection | undefined) => connection?.received.at(-1)?.op

describe('Gateway', () => {
  it('connects to a configured URL without asking for one', async () => {
    const { port } = wss.address() as { port: number }
    onConnection = connection => hello(connection)
    const api = fakeApi(async () => {
      throw new Error('not asked')
    })
    gateway = new Gateway(ctx, api as unknown as QQOfficialApi, 1 << 25, handlers().value, [10, 20], { url: `ws://127.0.0.1:${port}` })
    gateway.start()
    await vi.waitFor(() => expect(lastOp(connections[0])).toBe(2))
    expect(api.request).not.toHaveBeenCalled()
  })

  it('moves the platform gateway onto the API host, leaving other hosts alone', () => {
    const api = { ...fakeApi(), base: 'https://sandbox.api.bot.qq.com' }
    gateway = new Gateway(ctx, api as unknown as QQOfficialApi, 0, handlers().value)
    const onApiHost = (url: string) => gateway!['onApiHost'](url)
    expect(onApiHost('wss://api.sgroup.qq.com/websocket/')).toBe('wss://sandbox.api.bot.qq.com/websocket/')
    expect(onApiHost('ws://127.0.0.1:1234')).toBe('ws://127.0.0.1:1234')
  })

  it('identifies, goes online on READY and hands over the other events', async () => {
    const { value, statuses, events } = handlers()
    onConnection = connection => hello(connection)
    start(fakeApi(), value)
    await vi.waitFor(() => expect(lastOp(connections[0])).toBe(2))
    expect(connections[0].received[0]).toEqual({
      op: 2,
      d: { token: 'QQBot tok', intents: 1 << 25, shard: [0, 1] },
    })
    ready(connections[0])
    send(connections[0], { op: 0, s: 2, t: 'C2C_MESSAGE_CREATE', id: 'E', d: { id: 'm' } })
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toMatchObject({ t: 'C2C_MESSAGE_CREATE', d: { id: 'm' } })
    expect(value.ready).toHaveBeenCalledWith({ session_id: 'S1', user: { id: 'B', username: 'bot' } })
    expect(statuses).toEqual([Status.CONNECT, Status.ONLINE])
  })

  it('heartbeats with the last sequence number', async () => {
    onConnection = connection => {
      hello(connection, 30)
      connection.socket.on('message', (data) => {
        const payload = JSON.parse(data.toString())
        if (payload.op === 2) ready(connection)
        if (payload.op === 1) send(connection, { op: 11 })
      })
    }
    start(fakeApi(), handlers().value)
    await vi.waitFor(() => expect(connections[0].received.filter(p => p.op === 1).length).toBeGreaterThanOrEqual(2))
    expect(connections[0].received.find(p => p.op === 1)).toEqual({ op: 1, d: 1 })
    expect(connections).toHaveLength(1)
  })

  it('resumes the session after a drop it can come back from', async () => {
    onConnection = connection => hello(connection)
    const { value, statuses } = handlers()
    start(fakeApi(), value)
    await vi.waitFor(() => expect(lastOp(connections[0])).toBe(2))
    ready(connections[0])
    await vi.waitFor(() => expect(statuses.at(-1)).toBe(Status.ONLINE))
    connections[0].socket.close(4009)
    await vi.waitFor(() => expect(lastOp(connections[1])).toBe(6))
    expect(connections[1].received[0]).toEqual({ op: 6, d: { token: 'QQBot tok', session_id: 'S1', seq: 1 } })
    expect(statuses).toContain(Status.RECONNECT)
  })

  it('identifies again when the session is invalid', async () => {
    onConnection = connection => hello(connection)
    start(fakeApi(), handlers().value)
    await vi.waitFor(() => expect(lastOp(connections[0])).toBe(2))
    ready(connections[0])
    await new Promise(resolve => setTimeout(resolve, 20))
    send(connections[0], { op: 9, d: false })
    await vi.waitFor(() => expect(lastOp(connections[1])).toBe(2))

    // Server-side codes say the same
    ready(connections[1])
    await new Promise(resolve => setTimeout(resolve, 20))
    connections[1].socket.close(4006)
    await vi.waitFor(() => expect(lastOp(connections[2])).toBe(2))
  })

  it('reconnects when a heartbeat goes unanswered', async () => {
    onConnection = connection => hello(connection, 20)
    start(fakeApi(), handlers().value)
    await vi.waitFor(() => expect(connections.length).toBeGreaterThanOrEqual(2), { timeout: 2000 })
  })

  it('stops for good on a close code it cannot recover from', async () => {
    onConnection = connection => hello(connection)
    const { value, statuses } = handlers()
    start(fakeApi(), value)
    await vi.waitFor(() => expect(lastOp(connections[0])).toBe(2))
    connections[0].socket.close(4914)
    await vi.waitFor(() => expect(statuses.at(-1)).toBe(Status.OFFLINE))
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(connections).toHaveLength(1)
  })

  it('stops for good when the credentials are wrong, but retries other failures', async () => {
    const { value, statuses } = handlers()
    let calls = 0
    start(fakeApi(async () => {
      calls++
      if (calls === 1) throw new Error('network down')
      throw new CredentialError('wrong secret')
    }), value)
    await vi.waitFor(() => expect(statuses.at(-1)).toBe(Status.OFFLINE))
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(calls).toBe(2)
  })

  it('closes the connection when stopped and does not come back', async () => {
    onConnection = connection => hello(connection)
    const { value, statuses } = handlers()
    const instance = start(fakeApi(), value)
    await vi.waitFor(() => expect(lastOp(connections[0])).toBe(2))
    const closed = new Promise(resolve => connections[0].socket.once('close', resolve))
    instance.stop()
    await closed
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(connections).toHaveLength(1)
    expect(statuses.at(-1)).toBe(Status.OFFLINE)
  })
})
