import { Context, type Message } from 'cordis'
import { appendFile } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLogLevel, isDebugEnabled, setConfigLogLevel } from '@/common/logger'

vi.mock('@/main/log', async original => await original<object>())
vi.mock('@/main/logFiles', () => ({ logFilename: () => 'test.log', pruneOldLogs: vi.fn(async () => []) }))
vi.mock('node:fs', async original => ({ ...await original<object>(), appendFile: vi.fn(), stat: vi.fn() }))

const { default: Log, getLogCache } = await import('@/main/log')
let ctx: Context
let exporter: InstanceType<typeof Log>

beforeEach(() => {
  setConfigLogLevel('info')
  getLogCache().length = 0
  ctx = new Context()
  exporter = new Log(ctx)
  exporter.exportFile = false
})
afterEach(async () => {
  await ctx.fiber.dispose()
  setConfigLogLevel('info')
  getLogCache().length = 0
})

describe('WebUI log records', () => {
  it('keeps the plugin snapshot and original namespace in both cache and live events', async () => {
    const owner = { id: 'official', name: 'builtin:qq-official', title: 'QQ 官方机器人' }
    const logSource = vi.fn(() => owner)
    ctx.provide('plugins', { logSource })
    const listener = vi.fn()
    ctx.on('llob/log', listener)
    exporter.exportFile = true
    await ctx.plugin({ name: 'protocol-worker', apply(child) { child.logger('qq-official').info('已上线: %s', 'Bot') } })
    const record = getLogCache().at(-1)!
    expect(record).toMatchObject({ source: 'qq-official', plugin: owner, type: 'info', content: '已上线: Bot' })
    expect(logSource).toHaveBeenCalledWith(expect.objectContaining({ name: 'protocol-worker' }))
    expect(listener).toHaveBeenCalledWith(record)
    expect(appendFile).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('[QQ 官方机器人] qq-official 已上线: Bot'), expect.any(Function))
    logSource.mockReturnValue(undefined as any)
    expect(record.plugin).toEqual(owner)
  })

  it('preserves module names before the plugin service starts and for host loggers', () => {
    ctx.logger('config').info('ready')
    expect(getLogCache().at(-1)).toMatchObject({ source: 'config', plugin: undefined, content: 'ready' })
    exporter.export({ sn: 1, ts: 1, name: 'native', type: 'warn', level: 1, args: ['native message'] } as Message)
    expect(getLogCache().at(-1)).toMatchObject({ source: 'native', plugin: undefined, type: 'warn' })
  })

  it('filters future logs by each output threshold while retaining previously cached entries', () => {
    const logger = ctx.logger('sample')
    for (const [level, expected] of [
      ['info', ['info', 'warn', 'error']],
      ['debug', ['debug', 'info', 'warn', 'error']],
      ['warn', ['warn', 'error']],
      ['error', ['error']],
    ] as const) {
      const before = getLogCache().length
      setConfigLogLevel(level)
      exporter.levels.default = getLogLevel()
      logger.debug('debug')
      logger.info('info')
      logger.warn('warn')
      logger.error('error')
      expect(getLogCache().slice(before).map(record => record.type)).toEqual(expected)
      expect(isDebugEnabled()).toBe(level === 'debug')
    }
    expect(getLogCache()).toHaveLength(10)
  })

  it.each([undefined, 'invalid', 'constructor'])('falls back to Info for invalid level %s', level => {
    setConfigLogLevel('error')
    setConfigLogLevel(level)
    expect(getLogLevel()).toBe(2)
  })
})
