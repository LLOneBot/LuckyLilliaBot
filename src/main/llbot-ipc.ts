import net from 'node:net'
import { getLogger } from '@/common/logger'

const logger = getLogger('llbot-ipc')
import fs from 'node:fs'

// LLBot <-> Desktop IPC (仅直连/无头模式).
// - Windows: 命名管道. LL_IPC_PIPE 是短名 (不含 \\.\pipe\ 前缀), 这里拼上前缀 listen.
// - macOS/Linux: Unix Domain Socket. LL_IPC_PIPE 是 socket 文件绝对路径, 直接 listen (Node.js 会按路径判断).
// LLBot 是 server, Desktop 是 client 轮询 get_login_state.
// Desktop 通过环境变量 LL_IPC_PIPE 传入连接标识 (非无头模式不传, 这里直接跳过).
// 协议: JSON Lines, UTF-8, '\n' 分隔.
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
    // Desktop 退出 / 断开会触发 error, 忽略即可 (server 仍监听等待下次连接)
    socket.on('error', () => { })
  })

  // Windows: LL_IPC_PIPE 是短名, 拼 \\.\pipe\ 前缀; 其他系统: 直接当 UDS 路径.
  // UDS 上 listen 前需要清掉残留的旧 socket 文件, 否则 EADDRINUSE.
  let listenPath: string
  if (process.platform === 'win32') {
    listenPath = `\\\\.\\pipe\\${pipeName}`
  } else {
    listenPath = pipeName
    try { fs.unlinkSync(listenPath) } catch { /* 文件不存在 = 正常 */ }
  }

  server.listen(listenPath, () => {
    logger.info(`[LL_IPC] listening on ${listenPath}`)
  })
  server.on('error', (e: Error) => {
    logger.warn(`[LL_IPC] server error: ${e.message}`)
  })

  // 进程退出时清理 UDS 文件, 避免下次启动残留导致 EADDRINUSE (Windows 命名管道内核托管, 不需要).
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
