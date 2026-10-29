import { getLogger } from '@/common/logger'

const logger = getLogger('cmd-whitelist')

// 排障用 (--cmd-whitelist): 只放行 WHITELIST 里的出站 cmd, 用来二分掉线是不是某个业务 cmd 引起的。收包不受影响
const ENABLED = process.argv.includes('--cmd-whitelist')

// 登录 + 保活的最小集, 少一条登录都跑不完。排查时往这里逐条加回业务 cmd
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
  // 稳态遥测, 见 telemetry.ts
  'QQClubComm.getNewFlag',
  'RedTouchSvc.ClientReport',
  'OidbSvcTrpcTcp.0x102a_0',
  // 低频 aux 遥测
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

/** 每次拦截都记一行, 方便对掉线时间点 */
export function isCmdAllowed(cmd: string): boolean {
  if (!ENABLED || WHITELIST.has(cmd)) return true
  const n = (blocked.get(cmd) ?? 0) + 1
  blocked.set(cmd, n)
  logger.warn(`拦下 ${cmd} (累计 ${n} 次)`)
  return false
}

let statusLogged = false

/** 只打一次, 提醒过滤还开着 */
export function logCmdWhitelistStatus(): void {
  if (!ENABLED || statusLogged) return
  statusLogged = true
  logger.warn(`[实验模式] 出站 cmd 白名单已启用, 只放行 ${WHITELIST.size} 条, 其余全部拦下`)
  logger.warn(`放行: ${Array.from(WHITELIST).join(', ')}`)
}

export function getBlockedCmdStats(): Array<{ cmd: string; count: number }> {
  return Array.from(blocked, ([cmd, count]) => ({ cmd, count })).sort((a, b) => b.count - a.count)
}
