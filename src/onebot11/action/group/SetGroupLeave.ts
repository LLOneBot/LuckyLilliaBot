import BaseAction from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number
  is_dismiss: boolean
}

export default class SetGroupLeave extends BaseAction<Payload, void> {
  actionName = ActionName.SetGroupLeave

  protected async _handle(payload: Payload) {
    try {
      await this.ctx.ntGroupApi.quitGroup(payload.group_id.toString())
    } catch (e) {
      this.ctx.logger.error('退群失败', e)
      throw e
    }
  }
}
