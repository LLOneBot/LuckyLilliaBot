import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest'

// setup.ts 把整个 environment 模块 mock 掉了, 这里要测真实实现
vi.unmock('@/common/utils/environment')

import {
  currentPmhqTarget, getInstanceArg, getPluginDirs, getPmhqTarget, getProtocol, isPluginHmr, isPmhqMode, lockedProtocol,
  lockProtocol, protocolPins, resolveProtocolSelection, setProtocolSelection,
} from '@/common/utils/environment'

const argv = (...args: string[]) => ['node', 'main.ts', ...args]

describe('getPmhqTarget', () => {
  it('returns null without --pmhq-port', () => {
    expect(getPmhqTarget(argv('--qq', '10001'))).toBeNull()
    expect(getPmhqTarget(argv('--pmhq-host=10.0.0.2'))).toBeNull()
  })

  it('accepts both the space and the equals form', () => {
    expect(getPmhqTarget(argv('--pmhq-port', '13001'))).toEqual({ host: '127.0.0.1', port: '13001' })
    expect(getPmhqTarget(argv('--pmhq-port=13001'))).toEqual({ host: '127.0.0.1', port: '13001' })
    expect(getPmhqTarget(argv('--pmhq-port', '13001', '--pmhq-host', '10.0.0.2'))).toEqual({
      host: '10.0.0.2',
      port: '13001',
    })
    expect(getPmhqTarget(argv('--pmhq-port=13001', '--pmhq-host=10.0.0.2'))).toEqual({
      host: '10.0.0.2',
      port: '13001',
    })
  })

  it('still enables PMHQ when the flag carries no value', () => {
    expect(getPmhqTarget(argv('--pmhq-port'))).toEqual({ host: '127.0.0.1', port: '13000' })
    expect(getPmhqTarget(argv('--pmhq-port='))).toEqual({ host: '127.0.0.1', port: '13000' })
  })

  it('does not swallow the next flag as the value', () => {
    expect(getPmhqTarget(argv('--pmhq-port', '--dev'))).toEqual({ host: '127.0.0.1', port: '13000' })
    expect(getPmhqTarget(argv('--pmhq-host', '--dev', '--pmhq-port=13001'))).toEqual({
      host: '127.0.0.1',
      port: '13001',
    })
  })

  it('keeps working next to the other flags', () => {
    const t = getPmhqTarget(argv('--qq', '721011692', '--pmhq-port', '13001', '--dev'))
    expect(t).toEqual({ host: '127.0.0.1', port: '13001' })
  })
})

describe('isPmhqMode', () => {
  it('follows process.argv', () => {
    const real = process.argv
    try {
      process.argv = argv('--qq', '10001')
      expect(isPmhqMode()).toBe(false)
      process.argv = argv('--pmhq-port', '13001')
      expect(isPmhqMode()).toBe(true)
      process.argv = argv('--pmhq-port=13001')
      expect(isPmhqMode()).toBe(true)
    } finally {
      process.argv = real
    }
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

  it('pins the bridge and its address to --pmhq-port', () => {
    expect(protocolPins(argv('--pmhq-port', '13001', '--pmhq-host', '10.0.0.2'), {})).toEqual({
      mode: { value: 'pmhq', by: '--pmhq-port' },
      pmhq: { value: { host: '10.0.0.2', port: '13001' }, by: '--pmhq-port' },
    })
  })

  it('credits the desktop app with the flags it passes, and pins the pure protocol without --pmhq-port', () => {
    expect(protocolPins(argv('--pmhq-port=13001'), { LL_IPC_PIPE: 'x' })).toEqual({
      mode: { value: 'pmhq', by: 'desktop' },
      pmhq: { value: { host: '127.0.0.1', port: '13001' }, by: 'desktop' },
    })
    expect(protocolPins(argv('--protocol=macos'), { LL_IPC_PIPE: 'x' })).toEqual({
      mode: { value: 'direct', by: 'desktop' },
      protocol: { value: 'macos', by: 'desktop' },
    })
    expect(protocolPins(argv(), { LL_IPC_PIPE: 'x', PROTOCOL: 'mac' }).protocol).toEqual({ value: 'macos', by: 'PROTOCOL' })
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
  const settings = { mode: 'direct', protocol: 'macos', pmhq: { host: '127.0.0.1', port: '13000' } } as const

  it('lets each pinned field win and keeps the rest', () => {
    expect(resolveProtocolSelection(settings, {})).toEqual(settings)
    expect(resolveProtocolSelection(settings, { protocol: { value: 'watch', by: '-p' } })).toEqual({ ...settings, protocol: 'watch' })
    expect(resolveProtocolSelection(settings, {
      mode: { value: 'pmhq', by: '--pmhq-port' },
      pmhq: { value: { host: 'pmhq', port: '13001' }, by: '--pmhq-port' },
    })).toEqual({ mode: 'pmhq', protocol: 'macos', pmhq: { host: 'pmhq', port: '13001' } })
  })
})

// Module state from here on: the selection, the lock and the memoized launch pins only ever move forward
describe('the protocol in effect', () => {
  const realArgv = process.argv
  const realEnv = process.env
  const direct = (protocol: 'linux' | 'macos' | 'windows') => ({ mode: 'direct', protocol, pmhq: { host: 'a', port: '1' } } as const)

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
    setProtocolSelection({ mode: 'pmhq', protocol: 'macos', pmhq: { host: 'pmhq', port: '13001' } })
    expect(getProtocol()).toBe('linux')
    expect(isPmhqMode()).toBe(true)
    expect(currentPmhqTarget()).toEqual({ host: 'pmhq', port: '13001' })
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
