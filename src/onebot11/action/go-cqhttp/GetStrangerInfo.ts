import { BaseAction, Schema } from '../BaseAction'
import { OB11User } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'

interface Payload {
  user_id: number | string
}

interface Response extends OB11User {
  qid: string
  level: number
  login_days: number
  reg_time: number
  long_nick: string
  city: string
  country: string
  labels: string[]
}

export class GetStrangerInfo extends BaseAction<Payload, Response> {
  actionName = ActionName.GoCQHTTP_GetStrangerInfo
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const uin = +payload.user_id
    const info = await this.ctx.app.pmhq.fetchUserInfo(uin)
    const loginDays = await this.ctx.app.pmhq.fetchUserLoginDays(uin)
    return {
      user_id: info.uin,
      nickname: info.nick,
      sex: OB11Entities.sex(info.sex),
      age: info.age,
      qid: info.qid,
      level: info.level,
      login_days: loginDays,
      reg_time: info.regTime,
      long_nick: info.longNick,
      city: info.city,
      country: info.country,
      birthday_year: info.birthdayYear,
      birthday_month: info.birthdayMonth,
      birthday_day: info.birthdayDay,
      labels: info.labels
    }
  }
}
