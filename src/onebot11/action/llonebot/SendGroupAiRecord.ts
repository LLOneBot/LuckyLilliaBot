import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

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
    await this.ctx.app.pmhq.getGroupGenerateAiRecord(+payload.group_id, payload.character, payload.text, +payload.chat_type)
    return { message_id: 0 }
  }
}
