import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest'

// setup.ts 把整个 environment 模块 mock 掉了, 这里要测真实实现
vi.unmock('@/common/utils/environment')

import {
  currentNativeQQTarget, getInstanceArg, getPluginDirs, getNativeQQTarget, getProtocol, isPluginHmr, isNativeQQMode, lockedProtocol,
  lockProtocol, protocolPins, resolveProtocolSelection, setProtocolSelection,
} from '@/common/utils/environment'

const argv = (...args: string[]) => ['node', 'main.ts', ...args]

describe('NativeQQ launch', () => {
  it('selects the official QQ client bridge explicitly and accepts paths in either form', () => {
    expect(getNativeQQTarget(argv())).toBeNull()
    expect(getNativeQQTarget(argv('--nativeqq'))).toEqual({ configPath: '', qqPath: '' })
    expect(getNativeQQTarget(argv('--nativeqq-config=/config.json'))).toEqual({ configPath: '/config.json', qqPath: '' })
    expect(getNativeQQTarget(argv('--nativeqq', '--nativeqq-config', '/config.json', '--qq-path', '/QQ'))).toEqual({ configPath: '/config.json', qqPath: '/QQ' })
    expect(getNativeQQTarget(argv('--nativeqq', '--nativeqq-config', '--dev'))).toEqual({ configPath: '', qqPath: '' })
  })
  it('follows process.argv before a plugin selection exists', () => {
    const real = process.argv
    try { process.argv = argv('--nativeqq'); expect(isNativeQQMode()).toBe(true) }
    finally { process.argv = real }
  })
})

describe('getPluginDirs', () => {
  it('collects every occurrence in both forms', () => {
    expect(getPluginDirs(argv('--plugin-dir', 'a', '--plugin-dir=b', '--qq', '1'))).toEqual(['a', 'b'])
  })

  it('ignores a missing value and does not swallow the next flag', () => {
    expect(getPluginDirs(argv('--plugin-dir', '--plugin-hmr'))).toEqual([])
    expect(getPluginDirs(argv('--plugin-dir='))).toEqual([])
    expect(getPluginDirs(argv())).toEqual([])
  })
})

describe('isPluginHmr', () => {
  it('is only on with the flag', () => {
    expect(isPluginHmr(argv('--plugin-hmr'))).toBe(true)
    expect(isPluginHmr(argv('--dev'))).toBe(false)
  })
})

describe('getInstanceArg', () => {
  it('takes --instance in both forms, ahead of LLBOT_INSTANCE', () => {
    expect(getInstanceArg(argv('--instance', 'work'), {})).toBe('work')
    expect(getInstanceArg(argv('--instance=work'), { LLBOT_INSTANCE: 'env' })).toBe('work')
    expect(getInstanceArg(argv(), { LLBOT_INSTANCE: 'env' })).toBe('env')
  })

  it('has nothing without either, and does not swallow the next flag', () => {
    expect(getInstanceArg(argv(), {})).toBeUndefined()
    expect(getInstanceArg(argv('--instance', '--dev'), {})).toBeUndefined()
    expect(getInstanceArg(argv('--instance='), { LLBOT_INSTANCE: '' })).toBeUndefined()
  })
})

describe('protocolPins', () => {
  it('pins nothing for a bare launch', () => {
    expect(protocolPins(argv(), {})).toEqual({})
  })

  it('pins the official QQ client bridge to its flags', () => {
    expect(protocolPins(argv('--nativeqq', '--nativeqq-config=/config.json'), {})).toEqual({
      mode: { value: 'nativeqq', by: '--nativeqq' },
      nativeQQ: { value: { configPath: '/config.json', qqPath: '' }, by: '--nativeqq' },
    })
  })

  it('pins the pure protocol with --direct, leaving its protocol free', () => {
    expect(protocolPins(argv('--direct'), {})).toEqual({ mode: { value: 'direct', by: '--direct' } })
    expect(protocolPins(argv('--direct', '-p', 'linux'), {})).toEqual({
      mode: { value: 'direct', by: '--direct' }, protocol: { value: 'linux', by: '-p' },
    })
  })

  it('takes the protocol from either flag form, then the environment variable in any case', () => {
    expect(protocolPins(argv('-p', 'mac'), {}).protocol).toEqual({ value: 'macos', by: '-p' })
    expect(protocolPins(argv('-p=watch'), {}).protocol).toEqual({ value: 'watch', by: '-p' })
    expect(protocolPins(argv(), { Protocol: 'win' }).protocol).toEqual({ value: 'windows', by: 'Protocol' })
    expect(protocolPins(argv('--protocol', 'watch'), { PROTOCOL: 'win' }).protocol?.value).toBe('watch')
  })

  it('treats a blank value as not given, and an unknown one as linux', () => {
    expect(protocolPins(argv('--protocol='), { PROTOCOL: 'mac' }).protocol).toEqual({ value: 'macos', by: 'PROTOCOL' })
    expect(protocolPins(argv(), { PROTOCOL: '' }).protocol).toBeUndefined()
    expect(protocolPins(argv('--protocol', 'ipad'), {}).protocol).toEqual({ value: 'linux', by: '--protocol' })
  })
})

describe('resolveProtocolSelection', () => {
  const settings = { mode: 'direct', protocol: 'macos', nativeQQ: { qqPath: '/QQ' } } as const
  const selected = { ...settings, nativeQQ: { configPath: '', qqPath: '/QQ' } }

  it('lets each pinned field win and keeps the rest, a configuration file coming from the launch only', () => {
    expect(resolveProtocolSelection(settings, {})).toEqual(selected)
    expect(resolveProtocolSelection(settings, { protocol: { value: 'watch', by: '-p' } })).toEqual({ ...selected, protocol: 'watch' })
    expect(resolveProtocolSelection(settings, {
      mode: { value: 'nativeqq', by: '--nativeqq' },
      nativeQQ: { value: { configPath: '/nativeqq.json', qqPath: '' }, by: '--nativeqq' },
    })).toEqual({ mode: 'nativeqq', protocol: 'macos', nativeQQ: { configPath: '/nativeqq.json', qqPath: '' } })
  })
})

// Module state from here on: the selection, the lock and the memoized launch pins only ever move forward
describe('the protocol in effect', () => {
  const realArgv = process.argv
  const realEnv = process.env
  const direct = (protocol: 'linux' | 'macos' | 'windows') => ({ mode: 'direct', protocol, nativeQQ: { configPath: '/a.json', qqPath: '' } } as const)

  beforeAll(() => {
    process.argv = argv()
    process.env = {}
  })

  afterAll(() => {
    process.argv = realArgv
    process.env = realEnv
  })

  it('follows the selection of the NT protocol plugin, macOS by default', () => {
    expect(getProtocol()).toBe('macos')
    setProtocolSelection(direct('linux'))
    expect(getProtocol()).toBe('linux')
    setProtocolSelection(direct('macos'))
    expect(getProtocol()).toBe('macos')
    expect(isNativeQQMode()).toBe(false)
  })

  it('keeps linux for NativeQQ whatever the pure protocol was set to', () => {
    setProtocolSelection({ mode: 'nativeqq', protocol: 'macos', nativeQQ: { configPath: '/nativeQQ.json', qqPath: '' } })
    expect(getProtocol()).toBe('linux')
    expect(isNativeQQMode()).toBe(true)
    expect(currentNativeQQTarget()).toEqual({ configPath: '/nativeQQ.json', qqPath: '' })
  })

  it('stays with what the pure protocol was locked to until a restart', () => {
    setProtocolSelection(direct('macos'))
    expect(lockedProtocol()).toBeUndefined()
    lockProtocol()
    setProtocolSelection(direct('windows'))
    expect(lockedProtocol()).toBe('macos')
    expect(getProtocol()).toBe('macos')
    setProtocolSelection({ ...direct('windows'), mode: 'nativeqq' })
    expect(getProtocol()).toBe('linux')
  })
})
