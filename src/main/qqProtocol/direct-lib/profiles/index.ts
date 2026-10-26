import { getProtocol, type ProtocolId } from '@/common/utils/environment'
import type { ProtocolProfile, ProtocolName } from './types'
import { LINUX_PROFILE } from './linux'
import { WINDOWS_PROFILE } from './windows'
import { MACOS_PROFILE } from './macos'
import { WATCH_PROFILE } from './watch'

export type { ProtocolProfile, ProtocolName, ProtocolFamily, ReserveVariant } from './types'

export const PROFILES: Partial<Record<ProtocolName, ProtocolProfile>> = {
  linux: LINUX_PROFILE,
  windows: WINDOWS_PROFILE,
  macos: MACOS_PROFILE,
  watch: WATCH_PROFILE,
}

export const DEFAULT_PROFILE = LINUX_PROFILE

let _active: ProtocolProfile | null = null

export function getActiveProfile(): ProtocolProfile {
  if (_active) return _active
  const id: ProtocolId = getProtocol()
  const p = PROFILES[id]
  if (!p) {
    console.warn(`[profile] protocol "${id}" 尚未实现, 回退 linux`)
    _active = DEFAULT_PROFILE
  } else {
    _active = p
  }
  return _active
}

export function _resetActiveProfileForTest(): void {
  _active = null
}
