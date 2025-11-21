import { BaseAction } from '../BaseAction'
import { OB11Status } from '../../types'
import { ActionName } from '../types'
import { selfInfo } from '@/common/globalVars'

export default class GetStatus extends BaseAction<{}, OB11Status> {
  actionName = ActionName.GetStatus

  protected async _handle(): Promise<OB11Status> {
    return {
      online: selfInfo.online!,
      good: true,
      stat: {
        message_received: this.ctx.app.messageReceivedCount,
        message_sent: this.ctx.app.messageSentCount,
        last_message_time: this.ctx.app.lastMessageTime,
        startup_time: this.ctx.app.startupTime
      }
    }
  }
}
