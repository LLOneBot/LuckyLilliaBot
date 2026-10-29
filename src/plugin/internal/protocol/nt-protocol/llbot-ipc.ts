import net from 'node:net'
import { getLogger } from '@/common/logger'

const logger = getLogger('llbot-ipc')
import fs from 'node:fs'

// LLBot <-> Desktop IPC, Desktop 轮询 get_login_state。LL_IPC_PIPE 由 Desktop 传入: Windows 上是命名管道短名
// (不含 \\.\pipe\), 其他系统是 socket 文件路径。JSON Lines:
//   Desktop -> LLBot: {"type":"request","id":"1","method":"get_login_state"}
//   LLBot   -> Desktop: {"type":"response","id":"1","data":{state, qrcode_png_base64?, uin?, nickname?}}

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
let server: net.Server | null = null

export function setLoginState(patch: Partial<LoginState>): void {
  loginState = { ...loginState, ...patch }
}

export function getCurrentLoginState(): LoginState {
  return loginState
}

export function startIpcServer(): void {
  const pipeName = process.env.LL_IPC_PIPE
  if (!pipeName) return
  if (server) return

  server = net.createServer((socket) => {
    socket.setEncoding('utf8')
    let buffer = ''
    socket.on('data', (chunk: string) => {
      buffer += chunk
      let idx: number
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        if (line.trim()) handleLine(socket, line)
      }
    })
    // Desktop 断开也会触发 error
    socket.on('error', () => { })
  })

  let listenPath: string
  if (process.platform === 'win32') {
    listenPath = `\\\\.\\pipe\\${pipeName}`
  } else {
    listenPath = pipeName
    // 残留的 socket 文件会让 listen 报 EADDRINUSE
    try { fs.unlinkSync(listenPath) } catch { }
  }

  server.listen(listenPath, () => {
    logger.info(`[LL_IPC] listening on ${listenPath}`)
  })
  server.on('error', (e: Error) => {
    logger.warn(`[LL_IPC] server error: ${e.message}`)
  })

  if (process.platform !== 'win32') {
    const cleanup = () => {
      try { fs.unlinkSync(listenPath) } catch { }
    }
    process.once('exit', cleanup)
    process.once('SIGINT', () => { cleanup(); process.exit(0) })
    process.once('SIGTERM', () => { cleanup(); process.exit(0) })
  }
}

function handleLine(socket: net.Socket, line: string): void {
  let msg: { type?: string; id?: string; method?: string }
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.type !== 'request' || !msg.id || !msg.method) return

  let response: unknown
  if (msg.method === 'get_login_state') {
    response = { type: 'response', id: msg.id, data: loginState }
  } else {
    response = { type: 'response', id: msg.id, error: `unknown method: ${msg.method}` }
  }
  if (!socket.destroyed) {
    socket.write(JSON.stringify(response) + '\n')
  }
}
