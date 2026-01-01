import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { objectToSnake } from 'ts-case-convert'

interface Payload {
  group_id: number | string
  chat_type: number | string
}

type Response = {
  type: string
  characters: {
    character_id: string
    character_name: string
    preview_url: string
  }[]
}[]

export class GetAiCharacters extends BaseAction<Payload, Response> {
  actionName = ActionName.GetAiCharacters
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).default(42),
    chat_type: Schema.union([Number, String]).default(1),
  })

  async _handle(payload: Payload) {
    const res = await this.ctx.app.pmhq.fetchAiCharacterList(+payload.group_id, +payload.chat_type)
    return objectToSnake(res.property) as Response
  }
}
