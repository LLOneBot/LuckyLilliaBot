import { describe, it, expect, vi } from 'vitest'

// setup.ts 把整个 environment 模块 mock 掉了, 这里要测真实实现
vi.unmock('@/common/utils/environment')

import { getInstanceArg, getPluginDirs, getPmhqTarget, isPluginHmr, isPmhqMode } from '@/common/utils/environment'

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
