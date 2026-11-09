import type { NTProtocolConfig } from '../../../../../common/types'

export type LoginMode = NTProtocolConfig['mode']
export type ProtocolId = NTProtocolConfig['protocol']

interface Pin<T> {
  value: T
  /** A flag or an environment variable */
  by: string
}

/** What the launch fixes; see protocolPins() in common/utils/environment.ts. */
export interface ProtocolPins {
  mode?: Pin<LoginMode>
  protocol?: Pin<ProtocolId>
  nativeQQ?: Pin<{ configPath: string; qqPath: string }>
}

/** The official QQ client bridge as NativeQQ.health() has it: BridgeStatus of the protocol, in /api/login-info */
export interface BridgeStatus {
  /** stopped / starting / running / stopping / failed */
  session: string
  failure?: string
  authTokenSet: boolean
  /** QQ's process is up */
  qqRunning: boolean
  loggedIn: boolean
  qrcodeAvailable: boolean
}

export const LOGIN_MODES: { id: LoginMode; label: string; hint: string }[] = [
  { id: 'direct', label: '纯协议', hint: 'LLBot 自己模拟 QQ 客户端登录，不用安装 QQ' },
  { id: 'nativeqq', label: '官方 QQ 客户端桥接', hint: '需要安装官方 QQ 客户端，然后 LLBot 注入' },
]

export const PROTOCOLS: { id: ProtocolId; label: string; hint?: string }[] = [
  { id: 'linux', label: 'Linux' },
  { id: 'macos', label: 'macOS' },
  { id: 'windows', label: 'Windows' },
  { id: 'watch', label: '手表', hint: '手表 QQ 能调用的接口最少，比如拿不到群成员列表和历史消息' },
]

export const protocolLabel = (id: string) => PROTOCOLS.find(protocol => protocol.id === id)?.label ?? id

/** "由…指定" for a pin, with the spaces the WebUI puts between Chinese and Latin text. */
export function pinnedBy(by: string): string {
  return by.startsWith('-') ? `由启动参数 ${by} 指定` : `由环境变量 ${by} 指定`
}

/** The settings with what the launch fixes in place: what LLBot runs with. */
export function effectiveMethod(settings: NTProtocolConfig, pins: ProtocolPins): NTProtocolConfig {
  return {
    ...settings,
    mode: pins.mode?.value ?? settings.mode,
    protocol: pins.protocol?.value ?? settings.protocol,
    nativeQQ: pins.nativeQQ?.value ?? settings.nativeQQ,
  }
}

export function describeMethod(method: NTProtocolConfig): string {
  return method.mode === 'nativeqq'
    ? '官方 QQ 客户端桥接'
    : `纯协议 · ${protocolLabel(method.protocol)}`
}

/** Whether anything that matters for the method is left to choose. */
export function isEditable(method: NTProtocolConfig, pins: ProtocolPins): boolean {
  return !pins.mode || !(method.mode === 'nativeqq' ? pins.nativeQQ : pins.protocol)
}

/** Who fixed what, for the summary: said once when it all comes from one place and nothing is left to change. */
export function pinNote(method: NTProtocolConfig, pins: ProtocolPins): string | undefined {
  const fixed = [
    pins.mode && { field: '登录方式', by: pins.mode.by },
    method.mode === 'nativeqq'
      ? pins.nativeQQ && { field: 'QQ 路径', by: pins.nativeQQ.by }
      : pins.protocol && { field: '协议', by: pins.protocol.by },
  ].filter((item): item is { field: string; by: string } => !!item)
  if (!fixed.length) return
  const editable = isEditable(method, pins)
  const text = !editable && new Set(fixed.map(item => item.by)).size === 1
    ? pinnedBy(fixed[0].by)
    : fixed.map(item => item.field + pinnedBy(item.by)).join('，')
  return editable ? text : `${text}，这里改不了`
}

/**
 * The protocol a saved choice waits for a restart to use: the pure protocol speaks one protocol per process,
 * the one it had when its client was created.
 */
export function pendingProtocol(method: NTProtocolConfig, locked?: ProtocolId): ProtocolId | undefined {
  return method.mode === 'direct' && locked && method.protocol !== locked ? method.protocol : undefined
}
