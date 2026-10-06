import { getLogger } from '@/common/logger'

const logger = getLogger('cmd-whitelist')

/**
 * 出站 cmd 白名单 (排障实验用, 默认关闭, 加 `--cmd-whitelist` 打开)。
 *
 * 打开后只有 WHITELIST 里的 cmd 能出站, 其余在统一发包口 (client.sendCommand /
 * sendHeartbeat) 被拦下。用来二分"掉线是不是某个业务 cmd 触发的": 先只放行登录+保活这套
 * 最小集跑一段, 看还掉不掉, 再逐条把业务 cmd 加回来定位。
 *
 * 只拦出站, 收包 (MsgPush 等) 不受影响。
 */
const ENABLED = process.argv.includes('--cmd-whitelist')

/**
 * 最小可登录 + 可保活集。这几条少任何一条登录流程就跑不完:
 * - `wtlogin.*`            取码 / poll 扫码状态 / 换凭据
 * - `SsoEstablishShareKey` ESK, 签名通道握手, 登录前就要
 * - `SsoSecureA2*`         macOS profile 专用的登录后通道, 别的端不发
 * - `SsoInfoSync`          上线注册。拦掉它 registerOnline 抛错 -> clearSession, 登录直接失败
 * - `SsoHeartBeat`         SSO 层心跳
 * - `Heartbeat.Alive`      TCP 层保活 (type-13 包, 走 sendHeartbeat 不过 sendCommand)
 * - `SsoReport`            o3 遥测
 *
 * 要加回业务 cmd 就往这里加, 例如:
 *   'OidbSvcTrpcTcp.0xfe7_3'                              获取群成员列表
 *   'OidbSvcTrpcTcp.0x9067_202'                           拉 rkey
 *   'trpc.msg.register_proxy.RegisterProxy.SsoGetGroupMsg' 群历史消息
 */
const WHITELIST = new Set([
  'wtlogin.trans_emp',
  'wtlogin.login',
  'trpc.o3.ecdh_access.EcdhAccess.SsoEstablishShareKey',
  'trpc.o3.ecdh_access.EcdhAccess.SsoSecureA2Establish',
  'trpc.o3.ecdh_access.EcdhAccess.SsoSecureA2Access',
  'trpc.msg.register_proxy.RegisterProxy.SsoInfoSync',
  'trpc.qq_new_tech.status_svc.StatusService.SsoHeartBeat',
  'Heartbeat.Alive',
  'trpc.o3.report.Report.SsoReport',
  // 稳态遥测: 真机登录后每 ~316s 必发, 对齐避免"哑连接"被风控判失效 (见 telemetry.ts)。
  'QQClubComm.getNewFlag',
  'RedTouchSvc.ClientReport',
  'OidbSvcTrpcTcp.0x102a_0',
  // 低频 aux 遥测: 真机 ~27min 偶发一组 (见 telemetry.ts AUX_TELEMETRY_CMDS)。
  'OidbSvcTrpcTcp.0x102a_1',
  'OidbSvcTrpcTcp.0x116d_1',
  'OidbSvcTrpcTcp.0x9067_202',
  'trpc.group_pro.configdistribution.ConfigDistributionSvr.SsoGetConfig',
])

export class CmdBlockedError extends Error {
  constructor(readonly cmd: string) {
    super(`cmd ${cmd} 不在 --cmd-whitelist 白名单, 已拦下未发出`)
    this.name = 'CmdBlockedError'
  }
}

const blocked = new Map<string, number>()

/** 统一发包口调用。false = 不许发。每次拦截都记一行, 好对掉线时间点。 */
export function isCmdAllowed(cmd: string): boolean {
  if (!ENABLED || WHITELIST.has(cmd)) return true
  const n = (blocked.get(cmd) ?? 0) + 1
  blocked.set(cmd, n)
  logger.warn(`拦下 ${cmd} (累计 ${n} 次)`)
  return false
}

let statusLogged = false

/** connect 时打一次 (重连不重复), 免得忘了自己开着过滤在查问题。 */
export function logCmdWhitelistStatus(): void {
  if (!ENABLED || statusLogged) return
  statusLogged = true
  logger.warn(`[实验模式] 出站 cmd 白名单已启用, 只放行 ${WHITELIST.size} 条, 其余全部拦下`)
  logger.warn(`放行: ${Array.from(WHITELIST).join(', ')}`)
}

/** 被拦 cmd 的累计次数, 收尾时看都拦了些什么。 */
export function getBlockedCmdStats(): Array<{ cmd: string; count: number }> {
  return Array.from(blocked, ([cmd, count]) => ({ cmd, count })).sort((a, b) => b.count - a.count)
}
