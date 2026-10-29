import type { WebQQMessage } from '@luckylillia/plugin-sdk/webui'
import type { RawMessage } from '../types/webqq'
import { getSelfUid } from './webqqApi'

const cache = new WeakMap<RawMessage, WebQQMessage>()

/** A message as the WebQQ slots hand it to plugins: the same object for the same message, so memo holds. */
export function slotMessage(message: RawMessage): WebQQMessage {
  let result = cache.get(message)
  if (!result) {
    result = {
      msgId: message.msgId,
      msgSeq: String(message.msgSeq),
      chatType: Number(message.chatType),
      peerId: String(message.peerUin),
      senderUin: String(message.senderUin),
      senderName: message.sendMemberName || message.sendNickName || String(message.senderUin),
      time: Number(message.msgTime),
      text: (message.elements ?? []).map(element => element.textElement?.content ?? '').join(''),
      self: message.senderUid === getSelfUid(),
    }
    cache.set(message, result)
  }
  return result
}
