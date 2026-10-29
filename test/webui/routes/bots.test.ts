import { Status } from '@satorijs/protocol'
import type { Context } from 'cordis'
import { describe, expect, it } from 'vitest'
import { createTestApp } from '../helpers/testApp'
import { createBotsRoutes } from '@/plugin/internal/service/webui/BE/routes/bots'

describe('GET /bots', () => {
  it('lists every account with whether it is online', async () => {
    const bots = [
      { sid: 'llonebot:10001', platform: 'llonebot', selfId: '10001', status: Status.ONLINE },
      { sid: 'qq:APPID', platform: 'qq', selfId: 'APPID', status: Status.RECONNECT, user: { id: 'APPID', name: 'Bot', avatar: 'https://a/b.png' } },
    ]
    const ctx = { get: (name: string) => (name === 'bots' ? bots : undefined) } as unknown as Context
    const body = await (await createTestApp(createBotsRoutes(ctx)).request('/bots')).json()
    expect(body).toEqual({
      success: true,
      data: [
        { sid: 'llonebot:10001', platform: 'llonebot', selfId: '10001', status: Status.ONLINE },
        { sid: 'qq:APPID', platform: 'qq', selfId: 'APPID', status: Status.RECONNECT, name: 'Bot', avatar: 'https://a/b.png' },
      ],
    })
  })

  it('has nothing to list before the bots service is up', async () => {
    const ctx = { get: () => undefined } as unknown as Context
    expect(await (await createTestApp(createBotsRoutes(ctx)).request('/bots')).json()).toEqual({ success: true, data: [] })
  })
})
