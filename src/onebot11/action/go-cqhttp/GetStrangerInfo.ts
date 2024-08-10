import BaseAction from '../BaseAction'
import { OB11User } from '../../types'
import { OB11Constructor } from '../../constructor'
import { ActionName } from '../types'
import { NTQQUserApi } from '../../../ntqqapi/api/user'
import { getBuildVersion } from '@/common/utils/QQBasicInfo'
import { OB11UserSex } from '../../types'
import { calcQQLevel } from '@/common/utils/qqlevel'

interface Payload {
  user_id: number | string
}

export default class GoCQHTTPGetStrangerInfo extends BaseAction<Payload, OB11User> {
  actionName = ActionName.GoCQHTTP_GetStrangerInfo

  protected async _handle(payload: Payload): Promise<OB11User> {
    if (!(getBuildVersion() >= 26702)) {
      const user_id = payload.user_id.toString()
      const extendData = await NTQQUserApi.getUserDetailInfoByUin(user_id)
      const uid = (await NTQQUserApi.getUidByUin(user_id))!
      if (!uid || uid.indexOf('*') != -1) {
        const ret = {
          ...extendData,
          user_id: parseInt(extendData.info.uin) || 0,
          nickname: extendData.info.nick,
          sex: OB11UserSex.unknown,
          age: (extendData.info.birthday_year == 0) ? 0 : new Date().getFullYear() - extendData.info.birthday_year,
          qid: extendData.info.qid,
          level: extendData.info.qqLevel && calcQQLevel(extendData.info.qqLevel) || 0,
          login_days: 0,
          uid: ''
        }
        return ret
      }
      const data = { ...extendData, ...(await NTQQUserApi.getUserDetailInfo(uid)) }
      return OB11Constructor.stranger(data)
    } else {
      const user_id = payload.user_id.toString()
      const extendData = await NTQQUserApi.getUserDetailInfoByUinV2(user_id)
      const uid = (await NTQQUserApi.getUidByUin(user_id))!
      if (!uid || uid.indexOf('*') != -1) {
        const ret = {
          ...extendData,
          user_id: parseInt(extendData.detail.uin) || 0,
          nickname: extendData.detail.simpleInfo.coreInfo.nick,
          sex: OB11UserSex.unknown,
          age: 0,
          level: extendData.detail.commonExt.qqLevel && calcQQLevel(extendData.detail.commonExt.qqLevel) || 0,
          login_days: 0,
          uid: ''
        }
        return ret
      }
      const data = { ...extendData, ...(await NTQQUserApi.getUserDetailInfo(uid)) }
      return OB11Constructor.stranger(data)
    }
  }
}
