import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'llbot-instance-'))

vi.mock('@/common/globalVars', () => ({ DATA_DIR, STATE_DIR: path.join(DATA_DIR, 'state') }))
vi.unmock('@/common/utils/environment')

const { resolveInstance } = await import('@/common/instance')
const { lockInstance, InstanceLockedError } = await import('@/main/instanceLock')

const argv = (...args: string[]) => ['node', 'llbot.js', ...args]

afterAll(() => rmSync(DATA_DIR, { recursive: true, force: true }))

describe('resolveInstance', () => {
  it('uses default when nothing names one', () => {
    expect(resolveInstance(argv(), {}).name).toBe('default')
  })

  it('takes --instance, then LLBOT_INSTANCE', () => {
    expect(resolveInstance(argv('--instance', 'work'), { LLBOT_INSTANCE: 'env' })).toEqual({ name: 'work', reason: '--instance' })
    expect(resolveInstance(argv(), { LLBOT_INSTANCE: 'env' })).toEqual({ name: 'env', reason: 'LLBOT_INSTANCE' })
  })

  it('falls back to the instance named after -q only when there is one', () => {
    expect(resolveInstance(argv('-q', '10001'), {}).name).toBe('default')
    mkdirSync(path.join(DATA_DIR, 'instances', '10001'), { recursive: true })
    expect(resolveInstance(argv('-q', '10001'), {}).name).toBe('10001')
    // an explicit choice still wins
    expect(resolveInstance(argv('-q', '10001', '--instance', 'work'), {}).name).toBe('work')
  })

  it('refuses a name that cannot be a directory', () => {
    for (const name of ['../x', 'a b', '-x', 'a/b', 'x'.repeat(65)]) {
      expect(() => resolveInstance(argv(`--instance=${name}`), {})).toThrow(/不合法/)
    }
  })
})

describe('lockInstance', () => {
  it('keeps a second holder off the same instance until released', async () => {
    const release = await lockInstance('lock-a')
    await expect(lockInstance('lock-a')).rejects.toBeInstanceOf(InstanceLockedError)
    await expect(lockInstance('lock-a')).rejects.toThrow(`pid ${process.pid}`)
    // another instance is not affected
    const other = await lockInstance('lock-b')
    other()
    release()
    const again = await lockInstance('lock-a')
    again()
  })

  it('cleans up after itself', async () => {
    const release = await lockInstance('lock-c')
    release()
    expect(existsSync(path.join(DATA_DIR, 'state', 'instances', 'lock-c.json'))).toBe(false)
  })
})
