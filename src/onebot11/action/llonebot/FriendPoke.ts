import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { getBuildVersion } from '@/common/utils'

interface Payload {
  user_id: number | string
}

export class FriendPoke extends BaseAction<Payload, null> {
  actionName = ActionName.FriendPoke
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    if (!this.ctx.app.native.checkPlatform() || !this.ctx.app.native.checkVersion()) {
      await this.ctx.app.packet.sendPokePacket(+payload.user_id)
    }
    else{
      await this.ctx.app.native.sendFriendPoke(+payload.user_id)
    }
    return null
  }
}
