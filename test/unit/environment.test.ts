import { describe, it, expect, vi } from 'vitest'

// setup.ts 把整个 environment 模块 mock 掉了, 这里要测真实实现
vi.unmock('@/common/utils/environment')

import { getPmhqTarget, isPmhqMode } from '@/common/utils/environment'

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
