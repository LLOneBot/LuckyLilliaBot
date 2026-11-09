import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installHostLifecycle } from '@/main/hostLifecycle'

const originalArgv = process.argv
const parent = process.pid + 100
let stop: (() => Promise<void>) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(process, 'kill').mockReturnValue(true)
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  vi.stubEnv('LL_PARENT_PID', String(parent + 1))
})

afterEach(async () => {
  await stop?.()
  stop = undefined
  process.argv = originalArgv
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('host parent lifecycle', () => {
  it.each([
    [`--parent-pid=${parent}`],
    ['--parent-pid', String(parent)],
    ['--', `--parent-pid=${parent}`, `--parent-pid=${parent + 1}`],
  ])('disposes before exiting when the parent from %j disappears', async (...args) => {
    process.argv = ['node', 'llbot.js', ...args]
    const events: string[] = []
    const dispose = vi.fn(async () => {
      events.push('dispose started')
      await Promise.resolve()
      events.push('disposed')
    })
    vi.mocked(process.exit).mockImplementation(() => { events.push('exit'); return undefined as never })
    const log = vi.fn()
    stop = installHostLifecycle(dispose, log)

    await vi.advanceTimersByTimeAsync(1000)
    expect(process.kill).toHaveBeenCalledWith(parent, 0)
    expect(dispose).not.toHaveBeenCalled()

    vi.mocked(process.kill).mockImplementation(() => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }) })
    await vi.advanceTimersByTimeAsync(1000)
    expect(events).toEqual(['dispose started', 'disposed', 'exit'])
    expect(process.exit).toHaveBeenCalledWith(0)
    expect(log).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(process.kill).toHaveBeenCalledTimes(2)
    expect(dispose).toHaveBeenCalledOnce()
  })

  it.each([
    [],
    ['--parent-pid'],
    ['--parent-pid', '--direct'],
    ['--parent-pid='],
    ['--parent-pid=0'],
    ['--parent-pid=-1'],
    ['--parent-pid=1.5'],
    ['--parent-pid=invalid'],
    ['--parent-pid=9007199254740992'],
    [`--parent-pid=${process.pid}`],
  ])('ignores absent or invalid argv %j without an environment fallback', async (...args) => {
    process.argv = ['node', 'llbot.js', ...args]
    const dispose = vi.fn(async () => {})
    stop = installHostLifecycle(dispose, vi.fn())
    await vi.advanceTimersByTimeAsync(2000)
    expect(process.kill).not.toHaveBeenCalled()
    expect(dispose).not.toHaveBeenCalled()
    expect(process.exit).not.toHaveBeenCalled()
  })
})
