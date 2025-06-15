import { from } from '@satorijs/element'
import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  cmd: string
  hex: string
}
interface PBData{
  cmd: string
  hex: string
  echo?: string
}

export class SendRaw extends BaseAction<Payload, PBData> {
  actionName = ActionName.SendRaw
  payloadSchema = Schema.object({
    cmd: String,
    hex: String
  })

  async _handle(payload: Payload) {
    try {
      const result = await this.ctx.app.pmhq.sendPB(payload.cmd, Uint8Array.from(Buffer.from(payload.hex, 'hex')))
      return {
        cmd: result.cmd,
        hex: result.pb,
        ...(result.echo !== undefined ? { echo: result.echo } : {})
      }
    }
    catch (e) {
      this.ctx.logger.error('pmhq 发包失败', e)
      throw new Error(`pmhq 发包失败: ${e}`)
    }
  }
}
