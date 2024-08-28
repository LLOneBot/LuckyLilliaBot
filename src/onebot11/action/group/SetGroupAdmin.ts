import BaseAction from '../BaseAction'
import { GroupMemberRole } from '@/ntqqapi/types'
import { ActionName } from '../types'

interface Payload {
  group_id: number
  user_id: number
  enable: boolean
}

export default class SetGroupAdmin extends BaseAction<Payload, null> {
  actionName = ActionName.SetGroupAdmin

  protected async _handle(payload: Payload): Promise<null> {
    const member = await this.ctx.ntGroupApi.getGroupMember(payload.group_id, payload.user_id)
    const enable = payload.enable.toString() === 'true'
    if (!member) {
      throw `群成员${payload.user_id}不存在`
    }
    await this.ctx.ntGroupApi.setMemberRole(
      payload.group_id.toString(),
      member.uid,
      enable ? GroupMemberRole.admin : GroupMemberRole.normal,
    )
    return null
  }
}
