import { getProtocol } from './utils/environment'

/**
 * 协议端能力差异相关的错误。
 *
 * 各协议端 (linux / windows / macos / watch) 的 appid 在服务端对应不同产品线, 能访问的 cmd
 * 不是一套 —— 手表尤其窄。请求一个当前产品线没授权的 cmd, 服务端回 retCode=-10122
 * "Product does not have permission to access cmd"。
 *
 * 这类失败是**固定的**, 重试不会变好, 所以要跟普通请求失败区分开:
 * - 内部链路 (消息转换等) 据此降级, 用手头信息凑合, 别把整条事件丢掉
 * - 用户主动触发的 API 直接把它冒上去 —— message 已经是人话, 调用方原样展示即可
 */

export const CMD_NOT_PERMITTED_RET_CODE = -10122

const PROTOCOL_LABELS: Record<string, string> = {
  watch: '手表',
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
}

/**
 * cmd -> 人话功能名。**只影响提示措辞**: 没登记的 cmd 退回通用文案, 功能行为不受影响 ——
 * 所以这张表不必维护完整, 撞到哪个不顺眼的提示再补哪个。
 * 跟"必须列全才正确的能力清单"不是一回事, 别往那个方向长。
 */
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
