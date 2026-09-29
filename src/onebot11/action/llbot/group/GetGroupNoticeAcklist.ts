import { BaseAction, Schema } from '@/onebot11/action/BaseAction'
import { ActionName } from '@/onebot11/action/types'

interface Payload {
  group_id: number | string
  notice_id: string
  list_type: 'ack' | 'unack'
}

interface User {
  user_id: number
  avatar: string
  display_name: string
}

export class GetGroupNoticeAcklist extends BaseAction<Payload, User[]> {
  actionName = ActionName.GetGroupNoticeAcklist
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    notice_id: Schema.string().required(),
    list_type: Schema.union(['ack', 'unack']).default('ack')
  })

  protected async _handle(payload: Payload) {
    const users: {
      uin: number
      avatar: string
      face_flag: number
      display_name: string
    }[] = []
    const cookie = await this.ctx.ntWebApi.getCookies('qun.qq.com')
    let start = 0
    while (true) {
      const res = await this.ctx.ntWebApi.getGroupBulletinUnread(
        cookie,
        +payload.group_id,
        payload.notice_id,
        payload.list_type === 'ack' ? 1 : 0,
        start
      )
      if (res.retcode !== 0) {
        throw new Error(res.msg)
      }
      users.push(...res.data.users)
      const total = payload.list_type === 'ack' ? res.data.read_total : res.data.unread_total
      if (users.length >= total) break
      start = users.length
    }
    return users.map(e => ({
      user_id: e.uin,
      avatar: e.avatar,
      display_name: e.display_name
    }))
  }
}
