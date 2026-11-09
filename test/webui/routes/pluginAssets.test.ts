import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Context } from 'cordis'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '@/plugin/internal/service/webui/BE/passwordHash'
import { servePluginAsset, servePluginImage } from '@/plugin/internal/service/webui/BE/routes/plugins'

const dir = mkdtempSync(path.join(os.tmpdir(), 'llbot-plugin-assets-'))
const module = path.join(dir, 'index.js')
writeFileSync(module, 'export default () => {}')

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const webuiAsset = vi.fn((key: string, file: string) => {
  return key === '@scope+ui' && file === 'index.js' ? module : undefined
})
const ctx = { plugins: { webuiAsset } } as unknown as Context
// test/unit/setup.ts mocks the WebUI password to 'test-token'; the WebUI keeps its hash in a cookie named after the
// port the browser used -- these requests go to http://localhost with no port, so 80
const login = `theme=dark; webui_token_80=${hashPassword('test-token')}`

function get(url: string, cookie?: string, method = 'GET') {
  return servePluginAsset(ctx, new Request(`http://localhost${url}`, { method, headers: cookie ? { cookie } : {} }))
}

// Before the WebUI assets: their last test locks the login out for the rest of the file
describe('plugin images', () => {
  const image = path.join(dir, 'shot.png')
  writeFileSync(image, 'png bytes')
  const asset = vi.fn((key: string, file: string) => (key === 'pics' && file === 'deep/shot.png' ? image : undefined))
  const images = { plugins: { asset } } as unknown as Context
  const getImage = (url: string, headers: Record<string, string> = {}) =>
    servePluginImage(images, new Request(`http://localhost${url}`, { headers: { cookie: login, ...headers } }))

  it('serves an image with its type, sandboxed should it be opened on its own', async () => {
    const response = await getImage('/plugin-assets/pics/1.0.0/deep/shot.png')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-security-policy')).toMatch(/sandbox/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe('png bytes')
    expect(asset).toHaveBeenLastCalledWith('pics', 'deep/shot.png')
  })

  it('answers a revalidation of an unchanged file with 304', async () => {
    const etag = (await getImage('/plugin-assets/pics/1.0.0/deep/shot.png')).headers.get('etag')!
    expect(etag).toBeTruthy()
    const again = await getImage('/plugin-assets/pics/1.0.0/deep/shot.png', { 'if-none-match': etag })
    expect(again.status).toBe(304)
    expect(await again.text()).toBe('')
    expect((await getImage('/plugin-assets/pics/1.0.0/deep/shot.png', { 'if-none-match': 'W/"other"' })).status).toBe(200)
  })

  it('answers 404 for what the plugin service does not resolve', async () => {
    expect((await getImage('/plugin-assets/pics/1.0.0/other.png')).status).toBe(404)
  })
})

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
    // the name without the port is another instance's (or an old version's) login, not this one's
    expect((await get('/plugin-webui/@scope+ui/3/index.js', `webui_token=${hashPassword('test-token')}`)).status).toBe(401)
    expect((await get('/plugin-webui/@scope+ui/3/index.js', 'webui_token_80=wrong')).status).toBe(401)
  })

  it('answers 404 for anything the plugin service does not resolve, and only serves reads', async () => {
    expect((await get('/plugin-webui/@scope+ui/3/missing.js', login)).status).toBe(404)
    expect((await get('/plugin-webui/@scope+ui/3/%E0%A4%A.js', login)).status).toBe(404)
    expect((await get('/plugin-webui/@scope+ui/3/index.js', login, 'POST')).status).toBe(405)
  })

  // Last: the lockout is the WebUI login's own, and holds for the rest of this file
  it('counts a wrong cookie towards the login lockout like a wrong password, and keeps to the lockout', async () => {
    for (let i = 0; i < 4; i++) await get('/plugin-webui/@scope+ui/3/index.js', 'webui_token_80=wrong')
    expect((await get('/plugin-webui/@scope+ui/3/index.js', login)).status).toBe(401)
  })
})
