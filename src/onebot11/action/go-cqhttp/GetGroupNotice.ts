import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
}

interface Notice {
  notice_id: string
  sender_id: number
  publish_time: number
  message: {
    text: string
    images: {
      height: string
      width: string
      id: string
    }[]
  }
  settings: {
    is_show_edit_card: boolean
    tip_window: boolean
    confirm_required: boolean
    pinned: boolean
    send_new_member: boolean
  }
}

export class GetGroupNotice extends BaseAction<Payload, Notice[]> {
  actionName = ActionName.GoCQHTTP_GetGroupNotice
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const data = await this.ctx.ntWebApi.getGroupBulletinList(+payload.group_id)
    if (data.ec !== 0) {
      throw new Error(data.em)
    }
    const result: Notice[] = []
    for (const feed of [...data.feeds, ...data.inst]) {
      result.push({
        notice_id: feed.fid,
        sender_id: feed.u,
        publish_time: feed.pubt,
        message: {
          text: feed.msg.text,
          images: feed.msg.pics?.map(image => {
            return {
              height: image.h,
              width: image.w,
              id: image.id
            }
          }) ?? []
        },
        settings: {
          is_show_edit_card: !!feed.settings.is_show_edit_card,
          tip_window: !feed.settings.tip_window_type,
          confirm_required: !!feed.settings.confirm_required,
          pinned: !!feed.pinned,
          send_new_member: feed.type === 20
        }
      })
    }
    if (data.inst.length > 0) {
      result.sort((a, b) => b.publish_time - a.publish_time)
    }
    return result
  }
}
