import { BaseAction, Schema } from '../../BaseAction'
import { Config } from '@/common/types'
import { ActionName } from '../../types'

export class GetConfigAction extends BaseAction<{}, Config> {
  actionName = ActionName.GetConfig

  protected async _handle(): Promise<Config> {
    return this.ctx.config.get()
  }
}

export class SetConfigAction extends BaseAction<Config, null> {
  actionName = ActionName.SetConfig
  payloadSchema = Schema.object({
    milky: Schema.any(),
    satori: Schema.any(),
    ob11: Schema.any(),
    webui: Schema.any(),
    onlyLocalhost: Schema.boolean(),
    enableLocalFile2Url: Schema.boolean(),
    log: Schema.boolean(),
    autoDeleteFile: Schema.boolean(),
    autoDeleteFileSecond: Schema.number(),
    ffmpeg: Schema.string(),
    musicSignUrl: Schema.string(),
    msgCacheExpire: Schema.number(),
    rawMsgPB: Schema.boolean()
  })

  protected async _handle(payload: Config) {
    this.ctx.config.set(payload)
    await this.ctx.parallel('llob/config-updated', payload)
    return null
  }
}
