import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest'

// setup.ts 把整个 environment 模块 mock 掉了, 这里要测真实实现
vi.unmock('@/common/utils/environment')

import {
  currentPmhqTarget, getInstanceArg, getPluginDirs, getPmhqTarget, getProtocol, isPluginHmr, isPmhqMode, lockedProtocol,
  lockProtocol, protocolPins, resolveProtocolSelection, setProtocolSelection,
} from '@/common/utils/environment'

const argv = (...args: string[]) => ['node', 'main.ts', ...args]

describe('native PMHQ launch', () => {
  it('selects local PMHQ explicitly and accepts paths in either form', () => {
    expect(getPmhqTarget(argv())).toBeNull()
    expect(getPmhqTarget(argv('--pmhq'))).toEqual({ configPath: '', qqPath: '' })
    expect(getPmhqTarget(argv('--pmhq-config=/config.json'))).toEqual({ configPath: '/config.json', qqPath: '' })
    expect(getPmhqTarget(argv('--pmhq', '--pmhq-config', '/config.json', '--qq-path', '/QQ'))).toEqual({ configPath: '/config.json', qqPath: '/QQ' })
    expect(getPmhqTarget(argv('--pmhq', '--pmhq-config', '--dev'))).toEqual({ configPath: '', qqPath: '' })
  })
  it('rejects obsolete remote transport flags instead of silently choosing another account', () => {
    for (const flag of ['--pmhq-port', '--pmhq-port=13000', '--pmhq-host=remote']) {
      expect(() => getPmhqTarget(argv(flag))).toThrow('不再支持')
    }
  })
  it('follows process.argv before a plugin selection exists', () => {
    const real = process.argv
    try { process.argv = argv('--pmhq'); expect(isPmhqMode()).toBe(true) }
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

  it('pins the native bridge and credits Desktop for its flags', () => {
    expect(protocolPins(argv('--pmhq', '--pmhq-config=/config.json'), {})).toEqual({
      mode: { value: 'pmhq', by: '--pmhq' },
      pmhq: { value: { configPath: '/config.json', qqPath: '' }, by: '--pmhq' },
    })
    expect(protocolPins(argv('--pmhq'), { LL_IPC_PIPE: 'x' })).toEqual({
      mode: { value: 'pmhq', by: 'desktop' }, pmhq: { value: { configPath: '', qqPath: '' }, by: 'desktop' },
    })
    expect(protocolPins(argv('--protocol=macos'), { LL_IPC_PIPE: 'x' })).toEqual({
      mode: { value: 'direct', by: 'desktop' }, protocol: { value: 'macos', by: 'desktop' },
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
  const settings = { mode: 'direct', protocol: 'macos', pmhq: { configPath: '', qqPath: '' } } as const

  it('lets each pinned field win and keeps the rest', () => {
    expect(resolveProtocolSelection(settings, {})).toEqual(settings)
    expect(resolveProtocolSelection(settings, { protocol: { value: 'watch', by: '-p' } })).toEqual({ ...settings, protocol: 'watch' })
    expect(resolveProtocolSelection(settings, {
      mode: { value: 'pmhq', by: '--pmhq-port' },
      pmhq: { value: { configPath: '/pmhq.json', qqPath: '' }, by: '--pmhq-port' },
    })).toEqual({ mode: 'pmhq', protocol: 'macos', pmhq: { configPath: '/pmhq.json', qqPath: '' } })
  })
})

// Module state from here on: the selection, the lock and the memoized launch pins only ever move forward
describe('the protocol in effect', () => {
  const realArgv = process.argv
  const realEnv = process.env
  const direct = (protocol: 'linux' | 'macos' | 'windows') => ({ mode: 'direct', protocol, pmhq: { configPath: '/a.json', qqPath: '' } } as const)

  beforeAll(() => {
    process.argv = argv()
    process.env = {}
  })

  afterAll(() => {
    process.argv = realArgv
    process.env = realEnv
  })

  it('follows the selection of the NT protocol plugin', () => {
    expect(getProtocol()).toBe('linux')
    setProtocolSelection(direct('macos'))
    expect(getProtocol()).toBe('macos')
    expect(isPmhqMode()).toBe(false)
  })

  it('keeps linux for PMHQ whatever the pure protocol was set to', () => {
    setProtocolSelection({ mode: 'pmhq', protocol: 'macos', pmhq: { configPath: '/pmhq.json', qqPath: '' } })
    expect(getProtocol()).toBe('linux')
    expect(isPmhqMode()).toBe(true)
    expect(currentPmhqTarget()).toEqual({ configPath: '/pmhq.json', qqPath: '' })
  })

  it('stays with what the pure protocol was locked to until a restart', () => {
    setProtocolSelection(direct('macos'))
    expect(lockedProtocol()).toBeUndefined()
    lockProtocol()
    setProtocolSelection(direct('windows'))
    expect(lockedProtocol()).toBe('macos')
    expect(getProtocol()).toBe('macos')
    setProtocolSelection({ ...direct('windows'), mode: 'pmhq' })
    expect(getProtocol()).toBe('linux')
  })
})
