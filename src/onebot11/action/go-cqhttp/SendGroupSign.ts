import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { getBuildVersion } from '@/common/utils/misc'
import { selfInfo } from '@/common/globalVars'

interface Payload {
  group_id: number | string
}

export class SendGroupSign extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_SendGroupSign
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
  })

  async _handle(payload: Payload) {
    await this.ctx.app.ntqqPacketApi.sendGroupSignPacket(selfInfo.uin, payload.group_id.toString())
    return null
  }
}
