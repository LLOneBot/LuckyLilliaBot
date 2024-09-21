import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { SendElementEntities } from '@/ntqqapi/entities'
import { uri2local } from '@/common/utils'
import { sendMsg, createPeer, CreatePeerMode } from '../../helper/createMessage'

interface Payload {
  group_id: number | string
  file: string
  name: string
  folder?: string
  folder_id?: string
}

export class UploadGroupFile extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_UploadGroupFile
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    file: Schema.string().required(),
    name: Schema.string(),
    folder: Schema.string(),
    folder_id: Schema.string()
  })

  protected async _handle(payload: Payload): Promise<null> {
    const { success, errMsg, path, fileName } = await uri2local(payload.file)
    if (!success) {
      throw new Error(errMsg)
    }
    const file = await SendElementEntities.file(this.ctx, path, payload.name || fileName, payload.folder ?? payload.folder_id)
    const peer = await createPeer(this.ctx, payload, CreatePeerMode.Group)
    await sendMsg(this.ctx, peer, [file], [])
    return null
  }
}
