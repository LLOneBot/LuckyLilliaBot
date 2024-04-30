import BaseAction from '../BaseAction'
import { getGroup, getUidByUin } from '../../../common/data'
import { ActionName } from '../types'
import { SendMsgElementConstructor } from '../../../ntqqapi/constructor'
import { ChatType, SendFileElement } from '../../../ntqqapi/types'
import fs from 'fs'
import { NTQQMsgApi, Peer } from '../../../ntqqapi/api/msg'
import { uri2local } from '../../../common/utils'

interface Payload {
  user_id: number
  group_id?: number
  file: string
  name: string
  folder: string
}

class GoCQHTTPUploadFileBase extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_UploadGroupFile

  getPeer(payload: Payload): Peer {
    if (payload.user_id) {
      return { chatType: ChatType.friend, peerUid: getUidByUin(payload.user_id.toString()) }
    }
    return { chatType: ChatType.group, peerUid: payload.group_id.toString() }
  }

  protected async _handle(payload: Payload): Promise<null> {
    let file = payload.file
    if (fs.existsSync(file)) {
      file = `file://${file}`
    }
    const downloadResult = await uri2local(file)
    if (downloadResult.errMsg) {
      throw new Error(downloadResult.errMsg)
    }
    let sendFileEle: SendFileElement = await SendMsgElementConstructor.file(downloadResult.path, payload.name)
    await NTQQMsgApi.sendMsg(this.getPeer(payload), [sendFileEle])
    return null
  }
}

export class GoCQHTTPUploadGroupFile extends GoCQHTTPUploadFileBase {
  actionName = ActionName.GoCQHTTP_UploadGroupFile
}

export class GoCQHTTPUploadPrivateFile extends GoCQHTTPUploadFileBase {
  actionName = ActionName.GoCQHTTP_UploadPrivateFile
}
