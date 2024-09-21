import { ActionName } from '../types'
import { BaseAction, Schema } from '../BaseAction'

interface Payload {
  group_id: number | string
  type: 'talkative' | 'performer' | 'legend' | 'strong_newbie' | 'emotion' | 'all'
}

export class GetGroupHonorInfo extends BaseAction<Payload, unknown> {
  actionName = ActionName.GetGroupHonorInfo
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    type: Schema.union(['talkative', 'performer', 'legend', 'strong_newbie', 'emotion', 'all']).default('all')
  })

  protected async _handle(payload: Payload) {
    return await this.ctx.ntWebApi.getGroupHonorInfo(payload.group_id.toString(), payload.type)
  }
}
