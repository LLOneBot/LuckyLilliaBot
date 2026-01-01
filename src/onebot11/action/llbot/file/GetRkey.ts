import { BaseAction } from '@/onebot11/action/BaseAction'
import { ActionName } from '@/onebot11/action/types'

interface Response {
  private_key: string
  group_key: string
  expired_time: number
  updated_time: string
}

export class GetRKey extends BaseAction<{}, Response> {
  actionName = ActionName.GetRKey

  async _handle() {
    const rkey = await this.ctx.app.pmhq.getRKey()
    const now = new Date()
    const updatedTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    return {
      private_key: rkey.privateRKey,
      group_key: rkey.groupRKey,
      expired_time: rkey.expiredTime,
      updated_time: updatedTime,
    }
  }
}
