import { unwatchFile, watchFile } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthTokenWatcher,
  type AuthTokenStatus,
} from '../../../src/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/authTokenWatcher'
import { validateAuthToken } from '../../../src/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/sign'

// One watcher per protocol instance, writing into that instance's status

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  watchFile: vi.fn(),
  unwatchFile: vi.fn(),
}))

vi.mock('@/main/config', () => ({
  authTokenUtil: {
    reload: vi.fn(() => 'token-1'),
    getPath: vi.fn(() => '/tmp/test-data/auth_token.txt'),
  },
}))

vi.mock('@/plugin/internal/protocol/nt-protocol/qqProtocol/direct-lib/sign', () => ({
  validateAuthToken: vi.fn(),
}))

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function newStatus(): AuthTokenStatus {
  return { hasToken: false, validation: 'idle', message: '', loginError: '' }
}

beforeEach(() => {
  vi.mocked(validateAuthToken).mockResolvedValue('valid')
})

describe('AuthTokenWatcher', () => {
  it('checks the token into the status it was given and logs in with it', async () => {
    const status = newStatus()
    const onValid = vi.fn()
    const watcher = new AuthTokenWatcher(status, onValid, logger, () => false)

    watcher.start()
    expect(status).toMatchObject({ hasToken: true, validation: 'validating' })
    await vi.waitFor(() => expect(onValid).toHaveBeenCalledExactlyOnceWith('token-1'))
    expect(status).toMatchObject({ hasToken: true, validation: 'valid', message: '', loginError: '' })
    watcher.stop()
  })

  it('takes only its own listener off the file', () => {
    const watcher = new AuthTokenWatcher(newStatus(), vi.fn(), logger, () => false)
    watcher.start()
    const listener = (vi.mocked(watchFile).mock.lastCall as unknown[])[2]

    watcher.stop()
    expect(unwatchFile).toHaveBeenCalledExactlyOnceWith('/tmp/test-data/auth_token.txt', listener)
  })

  it('drops a check that is still out when it stops', async () => {
    let finish!: (result: 'valid') => void
    vi.mocked(validateAuthToken).mockReturnValue(new Promise<'valid'>((resolve) => { finish = resolve }))
    const onValid = vi.fn()
    const watcher = new AuthTokenWatcher(newStatus(), onValid, logger, () => false)

    watcher.start()
    watcher.stop()
    finish('valid')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onValid).not.toHaveBeenCalled()
  })

  it('logs in with the same token again for a protocol switched on again', async () => {
    const before = vi.fn()
    const first = new AuthTokenWatcher(newStatus(), before, logger, () => false)
    first.start()
    await vi.waitFor(() => expect(before).toHaveBeenCalledTimes(1))
    first.stop()

    const after = vi.fn()
    const second = new AuthTokenWatcher(newStatus(), after, logger, () => false)
    second.start()
    await vi.waitFor(() => expect(after).toHaveBeenCalledExactlyOnceWith('token-1'))
    second.stop()
  })
})
