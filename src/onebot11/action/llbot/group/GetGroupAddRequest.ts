import { BaseAction } from '../../BaseAction'
import { ActionName } from '../../types'

interface OB11GroupRequestNotify {
  group_id: number
  user_id: number
  flag: string
}

export default class GetGroupAddRequest extends BaseAction<{}, OB11GroupRequestNotify[]> {
  actionName = ActionName.GetGroupIgnoreAddRequest

  protected async _handle(): Promise<OB11GroupRequestNotify[]> {
    throw new Error('请使用 get_group_system_msg API, 可获取被过滤的加群通知')
  }
}
