import { RawMessage } from '@/ntqqapi/types'
import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  character: string
  group_id: number | string
  text: string
  chat_type: number | string
}

interface Response {
  message_id: number
}

export class SendGroupAiRecord extends BaseAction<Payload, Response> {
  actionName = ActionName.SendGroupAiRecord
  payloadSchema = Schema.object({
    character: Schema.string().required(),
    group_id: Schema.union([Number, String]).required(),
    text: Schema.string().required(),
    chat_type: Schema.union([Number, String]).default(1),
  })

  async _handle(payload: Payload) {
    // 先注册监听: 回推可能比 OIDB 响应先到。自己触发的, 所以走 nt/message-sent 而不是 nt/message-created
    const seen: RawMessage[] = []
    let targetMsgRandom: number | null = null
    const { promise, resolve } = Promise.withResolvers<Response>()
    const checkAndResolve = (msg: RawMessage) => {
      if (targetMsgRandom !== null && msg.msgRandom === targetMsgRandom) {
        dispose()
        const shortId = this.ctx.store.createMsgShortId(msg)
        resolve({ message_id: shortId })
        return true
      }
      return false
    }
    const dispose = this.ctx.on('nt/message-sent', (data) => {
      if (!checkAndResolve(data.message)) {
        seen.push(data.message)
      }
    })
    try {
      const res = await this.ctx.qqProtocol.getGroupGenerateAiRecord(+payload.group_id, payload.character, payload.text, +payload.chat_type)
      targetMsgRandom = res.msgRandom
      for (const msg of seen) {
        if (checkAndResolve(msg)) break
      }
    } catch (e) {
      dispose()
      throw e
    }
    return promise
  }
}
