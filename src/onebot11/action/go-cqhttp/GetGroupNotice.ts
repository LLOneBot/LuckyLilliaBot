import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  group_id: number | string
}

interface Notice {
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
}

export class GetGroupNotice extends BaseAction<Payload, Notice[]> {
  actionName = ActionName.GoCQHTTP_GetGroupNotice
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required()
  })

  protected async _handle(payload: Payload) {
    const data = await this.ctx.ntGroupApi.getGroupBulletinList(payload.group_id.toString())
    const result: Notice[] = []
    for (const feed of data.feeds) {
      result.push({
        sender_id: +feed.uin,
        publish_time: +feed.publishTime,
        message: {
          text: feed.msg.text,
          images: feed.msg.pics.map(image => {
            return {
              height: String(image.height),
              width: String(image.width),
              id: image.id
            }
          })
        }
      })
    }
    return result
  }
}
