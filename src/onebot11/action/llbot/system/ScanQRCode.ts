import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'
import { uri2local } from '@/common/utils'

interface Payload {
  file: string
}

interface ScanResultItem {
  text: string
}

export class ScanQRCode extends BaseAction<Payload, ScanResultItem[]> {
  actionName = ActionName.ScanQRCode
  payloadSchema = Schema.object({
    file: Schema.string().required()
  })

  async _handle(payload: Payload): Promise<ScanResultItem[]> {
    const { path: localPath, errMsg } = await uri2local(this.ctx, payload.file)
    if (errMsg) {
      throw new Error(errMsg)
    }
    const scanResult = await this.ctx.ntSystemApi.scanQRCode(localPath)
    return scanResult.infos.map(i => {
      return { text: i.text }
    })
  }
}
