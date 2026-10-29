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

let _active: { id: ProtocolId; profile: ProtocolProfile } | null = null

/** Follows getProtocol(), which holds still once the pure protocol has a client (lockProtocol). */
export function getActiveProfile(): ProtocolProfile {
  const id = getProtocol()
  if (_active?.id === id) return _active.profile
  let profile = PROFILES[id]
  if (!profile) {
    console.warn(`[profile] protocol "${id}" 尚未实现, 回退 linux`)
    profile = DEFAULT_PROFILE
  }
  _active = { id, profile }
  return profile
}

export function _resetActiveProfileForTest(): void {
  _active = null
}
