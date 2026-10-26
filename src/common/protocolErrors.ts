import { getProtocol } from './utils/environment'

// 各协议端 (linux / windows / macos / watch) 能访问的 cmd 不同, 手表尤其少; 没授权的 cmd 服务端回 -10122。
// 这种失败重试没用: 内部链路 (消息转换等) 据此降级, 用户调用的 API 直接把 message 抛出去

export const CMD_NOT_PERMITTED_RET_CODE = -10122

const PROTOCOL_LABELS: Record<string, string> = {
  watch: '手表',
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
}

// 只用于提示文案, 没登记的 cmd 用通用文案, 不必列全
const CMD_LABELS: Record<string, string> = {
  'OidbSvcTrpcTcp.0xfe7_3': '获取群成员列表',
  'trpc.msg.register_proxy.RegisterProxy.SsoGetC2cMsg': '获取私聊历史消息',
  'trpc.msg.register_proxy.RegisterProxy.SsoGetGroupMsg': '获取群历史消息',
}

export class CmdNotPermittedError extends Error {
  constructor(readonly cmd: string, readonly extraMsg = '') {
    const protocol = PROTOCOL_LABELS[getProtocol()] ?? getProtocol()
    const what = CMD_LABELS[cmd]
    super(what ? `${protocol}协议不支持${what}` : `${protocol}协议不支持此操作 (${cmd})`)
    this.name = 'CmdNotPermittedError'
  }
}

/** 按 name 判而非 instanceof: 打包后跨 chunk 的类身份不保证唯一。 */
export function isCmdNotPermitted(e: unknown): boolean {
  return e instanceof Error && e.name === 'CmdNotPermittedError'
}
