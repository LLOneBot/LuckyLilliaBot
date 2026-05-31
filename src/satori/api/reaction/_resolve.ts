import { Context } from 'cordis'

/** 直连模式没有 ntMsgApi.getMsgsByMsgId（按 msgId 索引）；走 store cache，再用 satori 自己生成的
 *  shortId（满足 Number.isInteger 时）回查 ('@/main/store').getMsgInfoByShortId 兜底。 */
export async function resolveStoredMsg(ctx: Context, messageId: string) {
  let msg = ctx.store.getMsgByMsgId(messageId)
  if (!msg) {
    const asShortId = Number(messageId)
    if (Number.isInteger(asShortId)) {
      const info = await ctx.store.getMsgInfoByShortId(asShortId)
      if (info) {
        msg = ctx.store.getMsgByMsgId(info.msgId)
      }
    }
  }
  return msg
}
