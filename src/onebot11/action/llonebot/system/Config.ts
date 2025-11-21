import { BaseAction, Schema } from '../../BaseAction'
import { Config } from '@/common/types'
import { ActionName } from '../../types'
import { getConfigUtil } from '@/common/config'

export class GetConfigAction extends BaseAction<{}, Config> {
  actionName = ActionName.GetConfig

  protected async _handle(): Promise<Config> {
    return getConfigUtil().getConfig()
  }
}

export class SetConfigAction extends BaseAction<Config, null> {
  actionName = ActionName.SetConfig
  payloadSchema = Schema.object({
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
    getConfigUtil().setConfig(payload)
    await this.ctx.parallel('llob/config-updated', payload)
    return null
  }
}
