import { BaseAction } from '../../../BaseAction'
import { ActionName } from '../../../types'

interface Payload {
  group_id: string
}

export class GetGroupAlbumList extends BaseAction<Payload, unknown> {
  actionName = ActionName.GetGroupAlbumList

  protected async _handle(payload: Payload) {
    const res = await this.ctx.ntGroupApi.getGroupAlbumList(payload.group_id.toString())
    if (res.response.result !== 0){
      throw new Error(`获取群相册列表失败 ${res.response.errMs}`)
    }
    return res.response.album_list
  }
}
