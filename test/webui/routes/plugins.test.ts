import { Context } from 'cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginConfigError, PluginForbiddenError, PluginNotFoundError, PluginRevConflictError } from '@/plugin'
import { createPluginRoutes } from '@/webui/BE/routes/plugins'
import { createTestApp } from '../helpers/testApp'

const status = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `pkg-${id}`, manifest: {}, state: 'active', ...extra })

let plugins: Record<string, ReturnType<typeof vi.fn>>
let app: ReturnType<typeof createTestApp>

beforeEach(() => {
  plugins = {
    list: vi.fn(() => [status('a'), status('b', { manifest: { hidden: true } })]),
    get: vi.fn((id: string) => status(id)),
    scan: vi.fn(async () => ({ added: ['c'], changed: [], removed: [] })),
    add: vi.fn(async (name: string) => status('new', { name })),
    remove: vi.fn(async () => undefined),
    enable: vi.fn(async (id: string) => status(id)),
    disable: vi.fn(async (id: string) => status(id, { state: 'disposed' })),
    reload: vi.fn(async () => ({ status: 'reloaded' })),
    describe: vi.fn(async () => ({ schema: null, defaults: {}, config: null })),
    updateConfig: vi.fn(async (id: string) => status(id)),
  }
  const ctx = {
    plugins,
    logger: () => ({ warn: vi.fn() }),
    on: vi.fn(() => () => true),
  } as unknown as Context
  app = createTestApp(createPluginRoutes(ctx), '/api/plugins')
})

const json = async (response: Response) => ({ status: response.status, body: await response.json() })

describe('plugin routes', () => {
  it('lists entries without the hidden ones', async () => {
    expect(await json(await app.request('/api/plugins'))).toEqual({
      status: 200,
      body: { success: true, data: [status('a')] },
    })
  })

  it('maps the entry actions onto the service', async () => {
    expect((await json(await app.request('/api/plugins/a/enable', { method: 'POST' }))).body.data).toEqual(status('a'))
    expect(plugins.enable).toHaveBeenCalledWith('a')
    await app.request('/api/plugins/a/disable', { method: 'POST' })
    expect(plugins.disable).toHaveBeenCalledWith('a')
    expect((await json(await app.request('/api/plugins/a/reload', { method: 'POST' }))).body.data).toEqual({ status: 'reloaded' })
    expect((await json(await app.request('/api/plugins/a', { method: 'DELETE' }))).body).toEqual({ success: true, data: null })
    expect((await json(await app.request('/api/plugins/scan', { method: 'POST' }))).body.data.added).toEqual(['c'])
    await app.request('/api/plugins', { method: 'POST', body: JSON.stringify({ name: 'pkg-x', config: { n: 1 } }) })
    expect(plugins.add).toHaveBeenCalledWith('pkg-x', { n: 1 })
    await app.request('/api/plugins/a/config', { method: 'PUT', body: JSON.stringify({ config: { n: 2 } }) })
    expect(plugins.updateConfig).toHaveBeenCalledWith('a', { n: 2 }, undefined, undefined)
    await app.request('/api/plugins/a/config', {
      method: 'PUT',
      body: JSON.stringify({ config: { n: 3 }, ifRev: 'r1', clear: ['smtp.auth.pass'] }),
    })
    expect(plugins.updateConfig).toHaveBeenLastCalledWith('a', { n: 3 }, 'r1', ['smtp.auth.pass'])
  })

  it('answers 400 with the issues when the schema rejects a config', async () => {
    plugins.updateConfig.mockRejectedValueOnce(new PluginConfigError([{ path: ['n'], message: 'expected number >= 0 but got -1' }]))
    expect(await json(await app.request('/api/plugins/a/config', { method: 'PUT', body: JSON.stringify({ config: { n: -1 } }) }))).toEqual({
      status: 400,
      body: {
        success: false,
        message: 'expected number >= 0 but got -1 (at n)',
        data: { issues: [{ path: ['n'], message: 'expected number >= 0 but got -1' }] },
      },
    })
  })

  it('answers 404 for unknown entries, 403 for actions a builtin refuses and 500 for anything else', async () => {
    plugins.enable.mockRejectedValueOnce(new PluginNotFoundError('no plugin entry zz'))
    expect(await json(await app.request('/api/plugins/zz/enable', { method: 'POST' }))).toEqual({
      status: 404,
      body: { success: false, message: 'no plugin entry zz' },
    })
    plugins.disable.mockRejectedValueOnce(new PluginForbiddenError('builtin:core is part of the bot core and cannot be disabled'))
    expect(await json(await app.request('/api/plugins/a/disable', { method: 'POST' }))).toEqual({
      status: 403,
      body: { success: false, message: 'builtin:core is part of the bot core and cannot be disabled' },
    })
    plugins.reload.mockRejectedValueOnce(new Error('reload failed: SyntaxError'))
    expect((await app.request('/api/plugins/a/reload', { method: 'POST' })).status).toBe(500)
  })

  it('answers 409 for a stale rev', async () => {
    plugins.updateConfig.mockRejectedValueOnce(new PluginRevConflictError('abc123'))
    expect(await json(await app.request('/api/plugins/a/config', { method: 'PUT', body: JSON.stringify({ config: {} }) }))).toEqual({
      status: 409,
      body: { success: false, message: 'the config changed since it was loaded', data: { rev: 'abc123' } },
    })
  })
})
