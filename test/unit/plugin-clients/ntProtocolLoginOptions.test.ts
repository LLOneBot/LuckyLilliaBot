import { describe, expect, it } from 'vitest'
import {
  describeMethod, effectiveMethod, isEditable, pendingProtocol, pinnedBy, pinNote,
} from '@/plugin/internal/protocol/nt-protocol/client/loginOptions'
import type { NTProtocolConfig } from '@/common/types'

const saved: NTProtocolConfig = { mode: 'direct', protocol: 'macos', nativeQQ: { qqPath: '' }, autoLoginUin: '' }
const protocolPin = { protocol: { value: 'linux', by: '-p' } } as const
const bridge = {
  mode: { value: 'nativeqq', by: '--nativeqq' },
  nativeQQ: { value: { configPath: '/nativeqq.json', qqPath: '' }, by: '--nativeqq' },
} as const

describe('login method', () => {
  it('runs with what the launch fixes over the saved settings', () => {
    expect(effectiveMethod(saved, {})).toEqual(saved)
    expect(effectiveMethod(saved, protocolPin)).toEqual({ ...saved, protocol: 'linux' })
    expect(effectiveMethod(saved, bridge)).toEqual({ ...saved, mode: 'nativeqq', nativeQQ: { configPath: '/nativeqq.json', qqPath: '' } })
  })

  it('reads as one line', () => {
    expect(describeMethod(saved)).toBe('纯协议 · macOS')
    expect(describeMethod({ ...saved, protocol: 'watch' })).toBe('纯协议 · 手表')
    expect(describeMethod({ ...saved, mode: 'nativeqq' })).toBe('官方 QQ 客户端桥接')
  })

  it('names where a pin comes from', () => {
    expect(pinnedBy('--protocol')).toBe('由启动参数 --protocol 指定')
    expect(pinnedBy('PROTOCOL')).toBe('由环境变量 PROTOCOL 指定')
  })

  it('is left to change while anything that matters for the mode is free', () => {
    expect(isEditable(saved, {})).toBe(true)
    // The protocol is fixed, the mode still free
    expect(isEditable(saved, protocolPin)).toBe(true)
    expect(isEditable(effectiveMethod(saved, bridge), bridge)).toBe(false)
    // The protocol does not matter for the bridge
    expect(isEditable(effectiveMethod(saved, bridge), { ...bridge, ...protocolPin })).toBe(false)
  })

  it('says who fixed it: once when nothing is left, field by field otherwise', () => {
    expect(pinNote(saved, {})).toBeUndefined()
    expect(pinNote(effectiveMethod(saved, bridge), bridge)).toBe('由启动参数 --nativeqq 指定，这里改不了')
    expect(pinNote(saved, { protocol: { value: 'macos', by: 'PROTOCOL' } })).toBe('协议由环境变量 PROTOCOL 指定')
    // The docker image without QQ: the protocol is still to choose
    expect(pinNote(saved, { mode: { value: 'direct', by: '--direct' } })).toBe('登录方式由启动参数 --direct 指定')
  })

  it('waits for a restart only for another protocol of the pure protocol', () => {
    expect(pendingProtocol(saved, undefined)).toBeUndefined()
    expect(pendingProtocol(saved, 'macos')).toBeUndefined()
    expect(pendingProtocol(saved, 'linux')).toBe('macos')
    expect(pendingProtocol({ ...saved, mode: 'nativeqq' }, 'linux')).toBeUndefined()
  })
})
