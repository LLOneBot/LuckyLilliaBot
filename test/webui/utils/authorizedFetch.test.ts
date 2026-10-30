import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizedFetch, setPasswordPromptHandler } from '@/plugin/internal/service/webui/FE/utils/api'

const cookies = new Map<string, string>()
vi.mock('@/plugin/internal/service/webui/FE/components/common', () => ({ showToast: () => {} }))
vi.mock('@/plugin/internal/service/webui/FE/utils/cookie', () => ({
  getCookie: (name: string) => cookies.get(name) ?? null,
  setCookie: (name: string, value: string) => cookies.set(name, value),
}))

const reply = (status: number, login?: string) => new Response('{"success":false}', {
  status,
  headers: login ? { 'X-Webui-Auth': login } : {},
})

describe('authorizedFetch', () => {
  const prompt = vi.fn(async () => 'secret')

  beforeEach(() => {
    cookies.clear()
    setPasswordPromptHandler(prompt)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for the password when the WebUI login refuses, and retries with it', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply(403, 'required'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect((await authorizedFetch('/api/config')).status).toBe(200)
    expect(prompt).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[1][1].headers['x-webui-token']).toBe(cookies.get('webui_token'))
  })

  it('leaves a 401 or 403 that a route answers on its own to the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(403)).mockResolvedValueOnce(reply(401)))
    expect((await authorizedFetch('/api/plugins/a1b2c3d4/disable', { method: 'POST' })).status).toBe(403)
    expect((await authorizedFetch('/api/some-plugin/thing')).status).toBe(401)
    expect(prompt).not.toHaveBeenCalled()
  })
})
