import fs from 'node:fs'
import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { SendMsgElementConstructor } from '@/ntqqapi/constructor'
import { ChatType, SendFileElement } from '@/ntqqapi/types'
import { uri2local } from '@/common/utils'
import { Peer } from '@/ntqqapi/types'
import { sendMsg } from '../../helper/createMessage'

interface Payload {
  user_id: number | string
  group_id?: number | string
  file: string
  name: string
  folder?: string
  folder_id?: string
}

export class GoCQHTTPUploadGroupFile extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_UploadGroupFile

  protected async _handle(payload: Payload): Promise<null> {
    let file = payload.file
    if (fs.existsSync(file)) {
      file = `file://${file}`
    }
    const downloadResult = await uri2local(file)
    if (!downloadResult.success) {
      throw new Error(downloadResult.errMsg)
    }
    const sendFileEle = await SendMsgElementConstructor.file(this.ctx, downloadResult.path, payload.name, payload.folder_id)
    await sendMsg(this.ctx, {
      chatType: ChatType.group,
      peerUid: payload.group_id?.toString()!,
    }, [sendFileEle], [], true)
    return null
  }
}

export class GoCQHTTPUploadPrivateFile extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_UploadPrivateFile

  async getPeer(payload: Payload): Promise<Peer> {
    if (payload.user_id) {
      const peerUid = await this.ctx.ntUserApi.getUidByUin(payload.user_id.toString())
      if (!peerUid) {
        throw `私聊${payload.user_id}不存在`
      }
      const isBuddy = await this.ctx.ntFriendApi.isBuddy(peerUid)
      return { chatType: isBuddy ? ChatType.friend : ChatType.temp, peerUid }
    }
    throw '缺少参数 user_id'
  }

  protected async _handle(payload: Payload): Promise<null> {
    const peer = await this.getPeer(payload)
    let file = payload.file
    if (fs.existsSync(file)) {
      file = `file://${file}`
    }
    const downloadResult = await uri2local(file)
    if (!downloadResult.success) {
      throw new Error(downloadResult.errMsg)
    }
    const sendFileEle: SendFileElement = await SendMsgElementConstructor.file(this.ctx, downloadResult.path, payload.name)
    await sendMsg(this.ctx, peer, [sendFileEle], [], true)
    return null
  }
}
