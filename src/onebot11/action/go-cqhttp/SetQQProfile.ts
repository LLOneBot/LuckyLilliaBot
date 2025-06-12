import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { selfInfo } from '@/common/globalVars'

interface Payload {
  nickname?: string
  personal_note?: string
}

export class SetQQProfile extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_SetQQProfile
  payloadSchema = Schema.object({
    nickname: Schema.string(),
    personal_note: Schema.string()
  })

  async _handle(payload: Payload) {
    const old = await this.ctx.ntUserApi.getUserDetailInfoWithBizInfo(selfInfo.uid)
    await this.ctx.ntUserApi.modifySelfProfile({
      nick: payload.nickname ?? old.coreInfo.nick,
      longNick: payload.personal_note ?? old.baseInfo.longNick,
      sex: old.baseInfo.sex,
      birthday: {
        birthday_year: old.baseInfo.birthday_year,
        birthday_month: old.baseInfo.birthday_month,
        birthday_day: old.baseInfo.birthday_day,
      },
      location: {
        country: '',
        province: '',
        city: '',
        zone: ''
      },
    })
    return null
  }
}
