import { getProtocol, type ProtocolId } from '@/common/utils/environment'
import type { ProtocolProfile, ProtocolName } from './types'
import { LINUX_PROFILE } from './linux'
import { WINDOWS_PROFILE } from './windows'
import { MACOS_PROFILE } from './macos'
import { WATCH_PROFILE } from './watch'

export type { ProtocolProfile, ProtocolName, ProtocolFamily, ReserveVariant } from './types'

// 四端 profile 注册表。
export const PROFILES: Partial<Record<ProtocolName, ProtocolProfile>> = {
  linux: LINUX_PROFILE,
  windows: WINDOWS_PROFILE,
  macos: MACOS_PROFILE,
  watch: WATCH_PROFILE,
}

export const DEFAULT_PROFILE = LINUX_PROFILE

let _active: ProtocolProfile | null = null

/** 当前进程激活的协议 profile。--protocol 决定, 首次访问解析并缓存 (进程内不变)。 */
export function getActiveProfile(): ProtocolProfile {
  if (_active) return _active
  const id: ProtocolId = getProtocol()
  const p = PROFILES[id]
  if (!p) {
    // 请求的协议还没实现 (Phase 2/3 未到), 回退 Linux 保证能起。
    console.warn(`[profile] protocol "${id}" 尚未实现, 回退 linux`)
    _active = DEFAULT_PROFILE
  } else {
    _active = p
  }
  return _active
}

/** 测试用: 重置激活缓存。生产代码不该调 (协议进程级不变)。 */
export function _resetActiveProfileForTest(): void {
  _active = null
}
