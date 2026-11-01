import { Context } from 'cordis'
import type Adapter from '@/plugin/internal/adapter/onebot11/adapter'
import { initActionMap } from '@/plugin/internal/adapter/onebot11/action'
import type { BaseAction } from '@/plugin/internal/adapter/onebot11/action/BaseAction'
import { decodeMessageId } from './utils'

// The account's own API, bot.internal, is OneBot 11's with the go-cqhttp and LLOneBot extensions: the actions the
// OneBot adapter serves, run here without its connections, so they work with that adapter switched off. Only ctx is
// what an action takes from the adapter (BaseAction).

export type Internal = Record<string, (params?: Record<string, unknown>) => Promise<any>>

// About a OneBot connection, not the account: the quick reply to an HTTP post, the event queue of HTTP polling
export const CONNECTION_ONLY = ['.handle_quick_operation', 'get_event']

/** `set_group_card` as setGroupCard, `_send_group_notice` as sendGroupNotice. */
export const internalName = (action: string) => action.replace(/^[._]+/, '').replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())

export function createInternal(ctx: Context): Internal {
  const internal: Internal = {}
  for (const [name, action] of initActionMap({ ctx } as unknown as Adapter)) {
    if (name.endsWith('_async') || name.endsWith('_rate_limited') || CONNECTION_ONLY.includes(name)) continue
    internal[internalName(name)] = params => call(ctx, action, params)
  }
  return internal
}

async function call(ctx: Context, action: BaseAction<any, unknown>, params: Record<string, unknown> = {}) {
  const result = await action.handle(await withOneBotIds(ctx, params), { messageFormat: 'array', debug: false })
  if (result.retcode !== 0) throw new Error(result.wording || result.message || `retcode ${result.retcode}`)
  return result.data
}

/** A plugin's `session.messageId` where OneBot wants its own number. */
async function withOneBotIds(ctx: Context, params: Record<string, unknown>) {
  const id = params.message_id
  if (typeof id !== 'string' || !id.includes('|')) return params
  const info = decodeMessageId(id)
  const msg = ctx.store.getMsgBySeq(info.peerUid, info.msgSeq) ?? (await ctx.ntMsgApi.getSingleMsg(info, info.msgSeq)).msgList[0]
  if (!msg) throw new Error('获取不到消息')
  return { ...params, message_id: ctx.store.createMsgShortId(msg) }
}
