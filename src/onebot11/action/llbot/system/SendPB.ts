import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  cmd: string
  hex: string
}
interface PBData {
  cmd: string
  hex: string
  echo?: string
}

export class SendPB extends BaseAction<Payload, PBData> {
  actionName = ActionName.SendPB
  payloadSchema = Schema.object({
    cmd: Schema.string().required(),
    hex: Schema.string().required()
  })

  async _handle(payload: Payload) {
    try {
      const result = await this.ctx.app.pmhq.sendPB(payload.cmd, payload.hex)
      return {
        cmd: result.cmd,
        hex: result.pb,
        ...(result.echo !== undefined ? { echo: result.echo } : {})
      }
    }
    catch (e) {
      this.ctx.logger.error('pmhq 发包失败', e)
      throw new Error(`pmhq 发包失败: ${e}`, { cause: e })
    }
  }
}
