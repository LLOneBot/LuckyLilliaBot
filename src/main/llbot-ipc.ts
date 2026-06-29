import net from 'node:net'

// LLBot <-> Desktop 命名管道 IPC (仅 Windows, 仅直连/无头模式).
// LLBot 是 server, Desktop 是 client 轮询 get_login_state.
// Desktop 通过环境变量 LL_IPC_PIPE 传入管道名 (非无头模式不传, 这里直接跳过).
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
  if (!pipeName || process.platform !== 'win32') return
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

  const pipePath = `\\\\.\\pipe\\${pipeName}`
  server.listen(pipePath, () => {
    console.log(`[LL_IPC] listening on ${pipePath}`)
  })
  server.on('error', (e: Error) => {
    console.warn(`[LL_IPC] server error: ${e.message}`)
  })
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
