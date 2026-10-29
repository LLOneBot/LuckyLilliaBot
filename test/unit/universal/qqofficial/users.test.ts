import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Context } from 'cordis'
import TimerService from '@cordisjs/plugin-timer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserNames } from '@/plugin/internal/protocol/qq-official/users'

let ctx: Context
let dir: string

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'llbot-qq-names-'))
  ctx = new Context()
  await ctx.plugin(TimerService)
  // What PluginService gives an entry
  Object.defineProperty(ctx, 'storage', { value: { dir: async () => dir }, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(dir, { recursive: true, force: true })
})

describe('UserNames', () => {
  it('keeps the names it sees on disk for the next start', async () => {
    const names = new UserNames(ctx, { appId: 'APP/1', persist: true })
    await names.load()
    names.set('qq', 'U1', 'Alice')
    names.set('qqguild', 'U9', ' Carol ')
    await names.dispose()
    const file = path.join(dir, 'usernames-APP_1.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ 'qq:U1': 'Alice', 'qqguild:U9': 'Carol' })

    const again = new UserNames(ctx, { appId: 'APP/1', persist: true })
    await again.load()
    expect(again.get('qq', 'U1')).toBe('Alice')
  })

  it('writes nothing when told not to', async () => {
    const names = new UserNames(ctx, { appId: 'A', persist: false })
    await names.load()
    names.set('qq', 'U1', 'Alice')
    await names.dispose()
    expect(names.get('qq', 'U1')).toBe('Alice')
    expect(() => readFileSync(path.join(dir, 'usernames-A.json'))).toThrow()
  })

  it('asks the lookup service by AppID and openid, only when one is set', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 1, data: { nickname: 'Bob', avatar: 'https://a/b.png' } })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await new UserNames(ctx, { appId: 'A', persist: false }).lookup('U2')).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
    const names = new UserNames(ctx, { appId: 'A', persist: false, lookupApi: 'https://names.example/api/Openid' })
    expect(await names.lookup('U2')).toEqual({ name: 'Bob', avatar: 'https://a/b.png' })
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://names.example/api/Openid?appid=A&openid=U2')
  })
})
