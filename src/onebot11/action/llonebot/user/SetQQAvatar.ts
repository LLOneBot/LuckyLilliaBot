import { unlink } from 'node:fs/promises'
import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { uri2local } from '@/common/utils/file'

interface Payload {
  file: string
}

export default class SetQQAvatar extends BaseAction<Payload, null> {
  actionName = ActionName.SetQQAvatar
  payloadSchema = Schema.object({
    file: Schema.string().required()
  })

  protected async _handle(payload: Payload) {
    const { path, isLocal, errMsg } = await uri2local(this.ctx, payload.file)
    if (errMsg) {
      throw new Error(errMsg)
    }
    const ret = await this.ctx.ntUserApi.setSelfAvatar(path)
    if (!isLocal) {
      unlink(path).then().catch(err => { })
    }
    if (ret.result !== 0) {
      throw new Error(ret.errMsg)
    }
    return null
  }
}
