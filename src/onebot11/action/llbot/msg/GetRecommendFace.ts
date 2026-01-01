import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  word: string
}

interface Response {
  url: string[]
}

export class GetRecommendFace extends BaseAction<Payload, Response> {
  actionName = ActionName.GetRecommendFace
  payloadSchema = Schema.object({
    word: Schema.string().required()
  })

  async _handle(payload: Payload) {
    const res = await this.ctx.app.pmhq.pullPics(payload.word)
    return { url: res.info.map(e => e.url!) }
  }
}
