import { Message } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeMessage, getPeer } from '../../utils'

interface Payload {
  channel_id: string
  message_id: string
}

export const getMessage: Handler<Message, Payload> = async (ctx, payload) => {
  const peer = await getPeer(ctx, payload.channel_id)
  // satori message.id 就是 NT 真 msgId（decodeMessage 里 message.id = data.msgId）。
  // 直连模式没有 ntMsgApi.getMsgsByMsgId 按 msgId 反查 NT 的途径，全靠 store cache；
  // store 里只缓存自己发出 / 收到 push 的消息——拉不到的就返回错。
  const raw = ctx.store.getMsgByMsgId(payload.message_id)
  if (!raw) throw new Error('消息为空')
  const result = await decodeMessage(ctx, raw)
  if (!result) {
    throw new Error('消息为空')
  }
  return result
}
