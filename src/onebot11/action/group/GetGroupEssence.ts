import { GroupEssenceMsgRet } from '@/ntqqapi/api'
import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

interface PayloadType {
  group_id: number
  pages?: number
}

export class GetGroupEssence extends BaseAction<PayloadType, GroupEssenceMsgRet | void> {
  actionName = ActionName.GoCQHTTP_GetEssenceMsg

  protected async _handle() {
    throw '此 api 暂不支持'
  }
}
