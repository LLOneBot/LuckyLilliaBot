import { BaseAction, Schema } from '../BaseAction'
import { OB11User } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { getBuildVersion } from '@/common/utils'
import { calcQQLevel } from '@/common/utils/misc'

interface Payload {
  user_id: number | string
}

interface Response extends OB11User {
  reg_time: number
  long_nick: string
}

export class GetStrangerInfo extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetStrangerInfo
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const uin = payload.user_id.toString()
    if (getBuildVersion() >= 26702) {
      const data = await this.ctx.ntUserApi.getUserDetailInfoByUinV2(uin)
      return {
        user_id: parseInt(data.detail.uin) || 0,
        nickname: data.detail.simpleInfo.coreInfo.nick,
        sex: OB11Entities.sex(data.detail.simpleInfo.baseInfo.sex),
        age: data.detail.simpleInfo.baseInfo.age,
        qid: data.detail.simpleInfo.baseInfo.qid,
        level: data.detail.commonExt.qqLevel && calcQQLevel(data.detail.commonExt.qqLevel) || 0,
        login_days: 0,
        reg_time: data.detail.commonExt.regTime,
        long_nick: data.detail.simpleInfo.baseInfo.longNick
      }
    } else {
      const data = await this.ctx.ntUserApi.getUserDetailInfoByUin(uin)
      return {
        user_id: parseInt(data.info.uin) || 0,
        nickname: data.info.nick,
        sex: OB11Entities.sex(data.info.sex),
        age: data.info.birthday_year === 0 ? 0 : new Date().getFullYear() - data.info.birthday_year,
        qid: data.info.qid,
        level: data.info.qqLevel && calcQQLevel(data.info.qqLevel) || 0,
        login_days: 0,
        reg_time: data.info.regTime,
        long_nick: data.info.longNick
      }
    }
  }
}
