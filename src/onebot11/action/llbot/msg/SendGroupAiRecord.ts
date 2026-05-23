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
    const res = await this.ctx.pmhq.getGroupGenerateAiRecord(+payload.group_id, payload.character, payload.text, +payload.chat_type)
    const targetMsgRandom = res.msgRandom.toString()
    const { promise, resolve } = Promise.withResolvers<Response>()
    const dispose = this.ctx.on('nt/message-created', (msg) => {
      if (msg.msgRandom === targetMsgRandom) {
        dispose()
        const shortId = this.ctx.store.createMsgShortId(msg)
        resolve({ message_id: shortId })
      }
    })
    return promise
  }
}
