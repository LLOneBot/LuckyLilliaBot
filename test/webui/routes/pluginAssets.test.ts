import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Context } from 'cordis'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '@/plugin/internal/service/webui/BE/passwordHash'
import { PluginForbiddenError } from '@/plugin/host'
import { servePluginAsset } from '@/plugin/internal/service/webui/BE/routes/plugins'

const dir = mkdtempSync(path.join(os.tmpdir(), 'llbot-plugin-assets-'))
const module = path.join(dir, 'index.js')
writeFileSync(module, 'export default () => {}')

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const webuiAsset = vi.fn((key: string, file: string) => {
  if (key === 'unapproved') throw new PluginForbiddenError('the WebUI of unapproved is not approved')
  return key === '@scope+ui' && file === 'index.js' ? module : undefined
})
const ctx = { plugins: { webuiAsset } } as unknown as Context
// test/unit/setup.ts mocks the WebUI password to 'test-token'; the WebUI keeps its hash in this cookie
const login = `theme=dark; webui_token=${hashPassword('test-token')}`

function get(url: string, cookie?: string, method = 'GET') {
  return servePluginAsset(ctx, new Request(`http://localhost${url}`, { method, headers: cookie ? { cookie } : {} }))
}

describe('plugin WebUI assets', () => {
  it('serves what the plugin service resolves, with a content type, to a logged-in WebUI', async () => {
    const response = await get('/plugin-webui/@scope+ui/3/index.js', login)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(await response.text()).toBe('export default () => {}')
    expect(webuiAsset).toHaveBeenLastCalledWith('@scope+ui', 'index.js')
  })

  it('wants the login cookie, since import() cannot send the login header', async () => {
    expect((await get('/plugin-webui/@scope+ui/3/index.js')).status).toBe(401)
    expect((await get('/plugin-webui/@scope+ui/3/index.js', 'webui_token=wrong')).status).toBe(401)
  })

  it('answers 403 for a package whose WebUI the user did not approve', async () => {
    expect((await get('/plugin-webui/unapproved/0/index.js', login)).status).toBe(403)
  })

  it('answers 404 for anything the plugin service does not resolve, and only serves reads', async () => {
    expect((await get('/plugin-webui/@scope+ui/3/missing.js', login)).status).toBe(404)
    expect((await get('/plugin-webui/@scope+ui/3/%E0%A4%A.js', login)).status).toBe(404)
    expect((await get('/plugin-webui/@scope+ui/3/index.js', login, 'POST')).status).toBe(405)
  })
})
