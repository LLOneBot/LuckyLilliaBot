import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { ElementType } from '@/ntqqapi/types'

export interface Payload {
  message_id: string | number
}

export interface Response {
  text: string
}

export class VoiceMsg2Text extends BaseAction<Payload, Response> {
  actionName = ActionName.VoiceMsg2Text
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload): Promise<Response> {
    const msgInfo = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msgInfo) {
      throw new Error('消息不存在')
    }
    let msg = this.ctx.store.getMsgCache(msgInfo.msgId)
    if (!msg) {
      const res = await this.ctx.ntMsgApi.getMsgsByMsgId(msgInfo.peer, [msgInfo.msgId])
      if (res.msgList.length === 0) {
        throw new Error('无法获取该消息')
      }
      msg = res.msgList[0]
    }
    const voiceElement = msg.elements.find(e => e.elementType === ElementType.Ptt)
    if (!voiceElement) {
      throw new Error('该消息不是语音消息')
    }
    const text = await this.ctx.ntMsgApi.translatePtt2Text(msgInfo.msgId, msgInfo.peer, voiceElement)
    if (!text) {
      throw new Error('无法转换语音消息为文本')
    }
    return { text }
  }

}

