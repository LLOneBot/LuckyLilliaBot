import BaseAction from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number
  user_id: number
  reject_add_request: boolean
}

export default class SetGroupKick extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupKick

  protected async _handle(payload: Payload): Promise<null> {
    const member = await this.ctx.ntGroupApi.getGroupMember(payload.group_id, payload.user_id)
    if (!member) {
      throw `群成员${payload.user_id}不存在`
    }
    await this.ctx.ntGroupApi.kickMember(payload.group_id.toString(), [member.uid], !!payload.reject_add_request)
    return null
  }
}
