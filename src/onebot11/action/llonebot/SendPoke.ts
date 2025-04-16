import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
  user_id: number | string
}

export class GroupPoke extends BaseAction<Payload, null> {
  actionName = ActionName.SendPoke
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]),
    user_id: Schema.union([Number, String]).required()
  })

  async _handle(payload: Payload) {
    if (this.ctx.app.pmhq.activated) {
      if (payload.group_id === undefined) {
        await this.ctx.app.pmhq.sendFriendPoke(+payload.user_id)
      } else {
        await this.ctx.app.pmhq.sendGroupPoke(+payload.group_id, +payload.user_id)
      }
      return null
    }
    if (!this.ctx.app.crychic.checkPlatform() || !this.ctx.app.crychic.checkVersion()) {
      throw new Error('请到LLOneBot设置页面配置发包器')
    } else if (payload.group_id === undefined) {
      await this.ctx.app.crychic.sendFriendPoke(+payload.user_id)
    } else {
      await this.ctx.app.crychic.sendGroupPoke(+payload.group_id, +payload.user_id)
    }
    return null
  }
}
