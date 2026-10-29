import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { parseBool } from '@/common/utils/misc'

interface Payload {
  group_id: number | string
  enable: boolean
}

export default class SetGroupWholeBan extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupWholeBan
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    enable: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(true)
  })

  protected async _handle(payload: Payload) {
    const res = await this.ctx.ntGroupApi.muteGroup(+payload.group_id, payload.enable)
    if (res.errorCode !== 0) {
      throw new Error(res.errorMsg)
    }
    return null
  }
}
