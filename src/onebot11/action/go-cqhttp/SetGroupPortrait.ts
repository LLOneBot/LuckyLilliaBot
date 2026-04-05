import { noop } from 'cosmokit'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'
import { uri2local } from '@/common/utils/file'
import { unlink } from 'node:fs/promises'

interface Payload {
  group_id: number | string
  file: string
  cache?: 0 | 1
}

export class SetGroupPortrait extends BaseAction<Payload, null> {
  actionName = ActionName.GoCQHTTP_SetGroupPortrait
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    file: Schema.string().required()
  })

  protected async _handle(payload: Payload) {
    const { path, isLocal, errMsg } = await uri2local(this.ctx, payload.file)
    if (errMsg) {
      throw new Error(errMsg)
    }
    const groupCode = payload.group_id.toString()
    const res = await this.ctx.ntGroupApi.setGroupAvatar(groupCode, path)
    if (!isLocal) {
      unlink(path).catch(noop)
    }
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    return null
  }
}
