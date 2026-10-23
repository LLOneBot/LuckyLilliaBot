import { Dict } from 'cosmokit'
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
    enableLocalFile2Url: Schema.boolean(),
    log: Schema.boolean(),
    autoDeleteFile: Schema.boolean(),
    autoDeleteFileSecond: Schema.number(),
    ffmpeg: Schema.string(),
    musicSignUrl: Schema.string(),
    msgCacheExpire: Schema.number()
  })

  protected async _handle(payload: Config) {
    // patch 而非 set: 只传了一部分字段时, 其余配置必须保持原样
    await this.ctx.parallel('llob/config-updated', this.ctx.config.patch(payload as Dict))
    return null
  }
}
