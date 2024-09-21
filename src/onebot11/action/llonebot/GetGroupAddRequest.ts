import { BaseAction } from '../BaseAction'
import { GroupNotifyStatus } from '@/ntqqapi/types'
import { ActionName } from '../types'

interface OB11GroupRequestNotify {
  group_id: number
  user_id: number
  flag: string
}

export default class GetGroupAddRequest extends BaseAction<null, OB11GroupRequestNotify[]> {
  actionName = ActionName.GetGroupIgnoreAddRequest

  protected async _handle(): Promise<OB11GroupRequestNotify[]> {
    const data = await this.ctx.ntGroupApi.getGroupIgnoreNotifies()
    const notifies = data.notifies.filter(notify => notify.status === GroupNotifyStatus.KUNHANDLE)
    const returnData: OB11GroupRequestNotify[] = []
    for (const notify of notifies) {
      const uin = await this.ctx.ntUserApi.getUinByUid(notify.user1.uid)
      returnData.push({
        group_id: parseInt(notify.group.groupCode),
        user_id: parseInt(uin),
        flag: notify.seq,
      })
    }
    return returnData
  }
}
