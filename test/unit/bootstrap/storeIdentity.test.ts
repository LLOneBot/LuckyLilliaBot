import { Context, Service } from 'cordis'
import { describe, expect, it, vi } from 'vitest'
import { ChatType } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import Store from '@/plugin/internal/protocol/nt-protocol/store'

describe('NT message store identity', () => {
  it('keeps private-message ids tied to its original login while that identity is being cleared', async () => {
    const ctx = new Context()
    const selfInfo = { uin: '1', uid: 'u_1', nick: '', online: true }
    const upsert = vi.fn(async () => {})
    await ctx.plugin(class Protocol extends Service {
      selfInfo = selfInfo
      constructor(ctx: Context) { super(ctx, 'qqProtocol') }
    })
    await ctx.plugin(class Database extends Service {
      upsert = upsert
      constructor(ctx: Context) { super(ctx, 'database') }
    })
    const store = new Store(ctx, { msgCacheExpire: 0 })
    const message = { msgId: '1', msgSeq: 2, msgRandom: 3, peerUid: 'u_peer', senderUid: 'u_1', chatType: ChatType.C2C }
    const id = store.createMsgShortId(message)
    Object.assign(selfInfo, { uin: '', uid: '', online: false })
    expect(store.createMsgShortId(message)).toBe(id)
    Object.assign(selfInfo, { uin: '2', uid: 'u_2', online: true })
    expect(store.createMsgShortId(message)).toBe(id)
    expect(upsert).toHaveBeenCalledOnce()
  })
})
