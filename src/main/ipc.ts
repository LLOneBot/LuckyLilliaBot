import net from 'node:net'
import fs from 'node:fs'
import { getLogger } from '@/common/logger'

export type LoginStateName =
  | 'initializing'
  | 'need_qrcode'
  | 'waiting_confirm'
  | 'logged_in'
  | 'expired'
  | 'cancelled'

export interface LoginState {
  state: LoginStateName
  qrcode_png_base64?: string
  uin?: string
  nickname?: string
}

let loginState: LoginState = { state: 'initializing' }
let server: net.Server | undefined
const sockets = new Set<net.Socket>()
let controls: PmhqControls | undefined
let shutdown: (() => void) | undefined

export interface PmhqControls {
  health(): Promise<unknown>
  qrcode(): Promise<unknown>
  setAuthToken(token: string): Promise<void>
}
export function registerPmhqControls(value: PmhqControls): () => void {
  controls = value
  return () => { if (controls === value) controls = undefined }
}
export function setHostShutdown(callback: () => void): void { shutdown = callback }
export function setLoginState(patch: Partial<LoginState>): void { loginState = { ...loginState, ...patch } }
export function getCurrentLoginState(): LoginState { return loginState }

/** Exported for protocol-independent IPC contract tests. */
export async function dispatchIpcRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
  if (method === 'get_login_state') return loginState
  if (method === 'shutdown') {
    if (!shutdown) throw new Error('Host shutdown is not ready')
    setImmediate(shutdown)
    return { stopping: true }
  }
  if (!['get_pmhq_health', 'get_pmhq_qrcode', 'refresh_pmhq_qrcode', 'set_pmhq_auth_token'].includes(method)) throw new Error('unknown method: ' + method)
  const current = controls
  if (!current) throw new Error('PMHQ protocol is not running')
  if (method === 'get_pmhq_health') return current.health()
  if (method === 'get_pmhq_qrcode' || method === 'refresh_pmhq_qrcode') return current.qrcode()
  if (typeof params?.token !== 'string' || !params.token.trim()) throw new Error('token must be a nonempty string')
  await current.setAuthToken(params.token)
  return { accepted: true }
}

export function startIpcServer(): void {
  const pipeName = process.env.LL_IPC_PIPE
  if (!pipeName || server) return
  server = net.createServer(socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    socket.setEncoding('utf8')
    let buffer = ''
    let pending = 0
    socket.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.length > 1024 * 1024) { socket.destroy(); return }
      let index: number
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1)
        if (++pending > 32) { socket.destroy(); return }
        void handleLine(socket, line).finally(() => pending--)
      }
    })
  })
  const endpoint = process.platform === 'win32' ? '\\\\.\\pipe\\' + pipeName : pipeName
  // Desktop assigns a fresh per-process endpoint. Never unlink another active server.
  server.listen(endpoint, () => getLogger('llbot-ipc').info('[LL_IPC] listening on ' + endpoint))
  server.on('error', error => getLogger('llbot-ipc').warn('[LL_IPC] ' + error.message))
}

export async function stopIpcServer(): Promise<void> {
  const current = server
  server = undefined
  for (const socket of sockets) socket.destroy()
  sockets.clear()
  if (current?.listening) await new Promise<void>(resolve => current.close(() => resolve()))
}

async function handleLine(socket: net.Socket, line: string): Promise<void> {
  let request: { type?: string; id?: string; method?: string; params?: Record<string, unknown> }
  try { request = JSON.parse(line) } catch { return }
  if (request.type !== 'request' || typeof request.id !== 'string' || !request.method) return
  let timer: NodeJS.Timeout | undefined
  let response: Record<string, unknown> = { type: 'response', id: request.id }
  try {
    response.data = await Promise.race([
      dispatchIpcRequest(request.method, request.params),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('IPC request timed out')), 20_000) }),
    ])
  } catch (error) { response.error = (error as Error).message }
  finally { if (timer) clearTimeout(timer) }
  if (!socket.destroyed) socket.write(JSON.stringify(response) + '\n')
}
