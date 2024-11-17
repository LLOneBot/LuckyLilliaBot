import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { getBuildVersion } from '@/common/utils'

interface Payload {
  group_id: number | string
  user_id: number | string
}

export class GroupPoke extends BaseAction<Payload, null> {
  actionName = ActionName.GroupPoke
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    user_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    if (!this.ctx.app.native.checkPlatform() || !this.ctx.app.native.checkVersion()) {
      await this.ctx.app.packet.sendPokePacket(+payload.user_id, +payload.group_id)
    }
    else{
      await this.ctx.app.native.sendGroupPoke(+payload.group_id, +payload.user_id)
    }
    return null
  }
}
