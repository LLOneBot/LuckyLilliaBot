import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

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
    throw new Error('暂不支持')
  }
}
