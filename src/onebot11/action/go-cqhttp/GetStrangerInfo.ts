import BaseAction from '../BaseAction'
import { OB11User } from '../../types'
import { getUidByUin, uidMaps } from '../../../common/data'
import { OB11Constructor } from '../../constructor'
import { ActionName } from '../types'
import { NTQQUserApi } from '../../../ntqqapi/api/user'

export default class GoCQHTTPGetStrangerInfo extends BaseAction<{ user_id: number }, OB11User> {
  actionName = ActionName.GoCQHTTP_GetStrangerInfo

  protected async _handle(payload: { user_id: number }): Promise<OB11User> {
    const user_id = payload.user_id.toString()
    const uid = getUidByUin(user_id)
    if (!uid) {
      throw new Error('查无此人')
    }
    return OB11Constructor.stranger(await NTQQUserApi.getUserDetailInfo(uid, true))
  }
}
