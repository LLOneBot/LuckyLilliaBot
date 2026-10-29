import { describe, expect, it } from 'vitest'
import {
  describeMethod, effectiveMethod, isEditable, pendingProtocol, pinnedBy, pinNote,
} from '@/plugin/internal/protocol/nt-protocol/client/loginOptions'
import type { NTProtocolConfig } from '@/common/types'

const saved: NTProtocolConfig = { mode: 'direct', protocol: 'macos', pmhq: { host: '127.0.0.1', port: 13000 } }
const desktopDirect = { mode: { value: 'direct', by: 'desktop' }, protocol: { value: 'linux', by: 'desktop' } } as const
const bridge = {
  mode: { value: 'pmhq', by: '--pmhq-port' },
  pmhq: { value: { host: 'pmhq', port: '13001' }, by: '--pmhq-port' },
} as const

describe('login method', () => {
  it('runs with what the launch fixes over the saved settings', () => {
    expect(effectiveMethod(saved, {})).toEqual(saved)
    expect(effectiveMethod(saved, desktopDirect)).toEqual({ ...saved, protocol: 'linux' })
    expect(effectiveMethod(saved, bridge)).toEqual({ ...saved, mode: 'pmhq', pmhq: { host: 'pmhq', port: 13001 } })
  })

  it('reads as one line', () => {
    expect(describeMethod(saved)).toBe('纯协议 · macOS')
    expect(describeMethod({ ...saved, protocol: 'watch' })).toBe('纯协议 · 手表')
    expect(describeMethod({ ...saved, mode: 'pmhq' })).toBe('官方 QQ 端桥接 · 127.0.0.1:13000')
  })

  it('names where a pin comes from', () => {
    expect(pinnedBy('desktop')).toBe('由 LuckyLillia 桌面端指定')
    expect(pinnedBy('--protocol')).toBe('由启动参数 --protocol 指定')
    expect(pinnedBy('PROTOCOL')).toBe('由环境变量 PROTOCOL 指定')
  })

  it('is left to change while anything that matters for the mode is free', () => {
    expect(isEditable(saved, {})).toBe(true)
    // The mode is fixed, the protocol still free
    expect(isEditable(saved, { mode: desktopDirect.mode })).toBe(true)
    expect(isEditable(effectiveMethod(saved, desktopDirect), desktopDirect)).toBe(false)
    // The protocol does not matter for the bridge
    expect(isEditable(effectiveMethod(saved, bridge), { ...bridge, protocol: desktopDirect.protocol })).toBe(false)
    expect(isEditable(saved, { protocol: { value: 'watch', by: '-p' } })).toBe(true)
  })

  it('says who fixed it: once when nothing is left, field by field otherwise', () => {
    expect(pinNote(saved, {})).toBeUndefined()
    expect(pinNote(effectiveMethod(saved, desktopDirect), desktopDirect)).toBe('由 LuckyLillia 桌面端指定，这里改不了')
    expect(pinNote(effectiveMethod(saved, bridge), bridge)).toBe('由启动参数 --pmhq-port 指定，这里改不了')
    expect(pinNote(saved, { protocol: { value: 'macos', by: 'PROTOCOL' } })).toBe('协议由环境变量 PROTOCOL 指定')
    const mixed = { mode: desktopDirect.mode, protocol: { value: 'macos', by: 'PROTOCOL' } } as const
    expect(pinNote(effectiveMethod(saved, mixed), mixed)).toBe('登录方式由 LuckyLillia 桌面端指定，协议由环境变量 PROTOCOL 指定，这里改不了')
  })

  it('waits for a restart only for another protocol of the pure protocol', () => {
    expect(pendingProtocol(saved, undefined)).toBeUndefined()
    expect(pendingProtocol(saved, 'macos')).toBeUndefined()
    expect(pendingProtocol(saved, 'linux')).toBe('macos')
    expect(pendingProtocol({ ...saved, mode: 'pmhq' }, 'linux')).toBeUndefined()
  })
})
