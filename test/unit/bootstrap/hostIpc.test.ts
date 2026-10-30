import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispatchIpcRequest, registerPmhqControls, setHostShutdown, startIpcServer, stopIpcServer } from '@/main/ipc'

let unregister: (() => void) | undefined
let socket: net.Socket | undefined
const oldPipe = process.env.LL_IPC_PIPE
afterEach(async () => { socket?.destroy(); await stopIpcServer(); unregister?.(); if (oldPipe) process.env.LL_IPC_PIPE = oldPipe; else delete process.env.LL_IPC_PIPE })

describe('Desktop IPC', () => {
  it('uses independent JSON-lines request IDs, returns bounded errors and preserves the current control owner', async () => {
    const stale = registerPmhqControls({ health: async () => 'old', qrcode: async () => ({}), setAuthToken: async () => {} })
    unregister = registerPmhqControls({ health: async () => ({ sessionStatus: 'running' }), qrcode: async () => ({ code: -1 }), setAuthToken: async () => {} })
    stale()
    process.env.LL_IPC_PIPE = process.platform === 'win32' ? 'llbot-test-' + randomUUID() : path.join(tmpdir(), 'llbot-' + randomUUID() + '.sock')
    startIpcServer()
    const endpoint = process.platform === 'win32' ? '\\\\.\\pipe\\' + process.env.LL_IPC_PIPE : process.env.LL_IPC_PIPE
    socket = net.connect(endpoint!)
    await new Promise<void>((resolve, reject) => { socket!.once('connect', resolve); socket!.once('error', reject) })
    const responses = new Promise<any[]>(resolve => {
      let buffer = ''; const result: any[] = []
      socket!.on('data', chunk => { buffer += chunk; let newline: number; while ((newline = buffer.indexOf('\n')) >= 0) { result.push(JSON.parse(buffer.slice(0, newline))); buffer = buffer.slice(newline + 1); if (result.length === 3) resolve(result) } })
    })
    for (const [id, method] of [['1', 'get_pmhq_health'], ['2', 'get_pmhq_qrcode'], ['3', 'unknown']]) socket.write(JSON.stringify({ type: 'request', id, method }) + '\n')
    const result = await responses
    expect(result.find(r => r.id === '1').data).toEqual({ sessionStatus: 'running' })
    expect(result.find(r => r.id === '2').data).toEqual({ code: -1 })
    expect(result.find(r => r.id === '3').error).toContain('unknown method')
  })
  it('acknowledges shutdown before starting host disposal', async () => {
    const stop = vi.fn(); setHostShutdown(stop)
    await expect(dispatchIpcRequest('shutdown')).resolves.toEqual({ stopping: true })
    expect(stop).not.toHaveBeenCalled()
    await new Promise(resolve => setImmediate(resolve))
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
