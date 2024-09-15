import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  status: number | string
  ext_status: number | string
  battery_status: number | string
}

export class SetOnlineStatus extends BaseAction<Payload, null> {
  actionName = ActionName.SetOnlineStatus

  async _handle(payload: Payload) {
    const ret = await this.ctx.ntUserApi.setSelfStatus(
      Number(payload.status),
      Number(payload.ext_status),
      Number(payload.battery_status),
    )
    if (ret.result !== 0) {
      this.ctx.logger.error(ret)
      throw new Error('设置在线状态失败')
    }
    return null
  }
}
