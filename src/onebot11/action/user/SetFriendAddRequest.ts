import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'
import { ChatType } from '@/ntqqapi/types'

interface Payload {
  flag: string
  approve?: boolean | string
  remark?: string
}

export default class SetFriendAddRequest extends BaseAction<Payload, null> {
  actionName = ActionName.SetFriendAddRequest

  protected async _handle(payload: Payload): Promise<null> {
    const approve = payload.approve?.toString() !== 'false'
    const data = payload.flag.split('|')
    if (data.length < 2) {
      throw new Error('无效的flag')
    }
    const uid = data[0]
    const reqTime = data[1]
    await this.ctx.ntFriendApi.handleFriendRequest(uid, reqTime, approve)
    if (payload.remark) {
      await this.ctx.ntFriendApi.setBuddyRemark(uid, payload.remark)
    }
    /*await this.ctx.ntMsgApi.activateChat({
      peerUid: uid,
      chatType: ChatType.C2C,
      guildId: ''
    })*/
    return null
  }
}
