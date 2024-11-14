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
    // if (!this.ctx.app.native.checkPlatform()) {
    //   throw new Error('当前系统平台或架构不支持')
    // }
    // if (!this.ctx.app.native.checkVersion()) {
    //   throw new Error(`当前 QQ 版本 ${getBuildVersion()} 不支持，可尝试其他版本 27333—27597`)
    // }
    // await this.ctx.app.native.sendGroupPoke(+payload.group_id, +payload.user_id)
    await this.ctx.app.packet.sendPokePacket(+payload.user_id, +payload.group_id)
    return null
  }
}
