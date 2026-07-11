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
    const res = await this.ctx.ntUserApi.modifySelfProfile({
      nick: payload.nickname,
      bio: payload.personal_note
    })
    if (res.errorCode !== 0) {
      throw new Error(res.errorMsg)
    }
    return null
  }
}
