import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

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
    if (this.ctx.app.pmhq.activated) {
      await this.ctx.app.pmhq.sendGroupPoke(+payload.group_id, +payload.user_id)
      return null
    }
    if (!this.ctx.app.crychic.checkPlatform() || !this.ctx.app.crychic.checkVersion()) {
      throw new Error('请到LLOneBot设置页面配置发包器')
    }
    else{
      await this.ctx.app.crychic.sendGroupPoke(+payload.group_id, +payload.user_id)
    }
    return null
  }
}
