import { Dict } from 'cosmokit'
import { BaseAction, Schema } from '../../BaseAction'
import { LegacyConfig } from '@/common/types'
import { ActionName } from '../../types'
import { applyLegacyConfig, legacyConfig } from '../../../../main/config/legacyConfig'

export class GetConfigAction extends BaseAction<{}, LegacyConfig> {
  actionName = ActionName.GetConfig

  protected async _handle(): Promise<LegacyConfig> {
    return legacyConfig(this.ctx)
  }
}

export class SetConfigAction extends BaseAction<LegacyConfig, null> {
  actionName = ActionName.SetConfig
  payloadSchema = Schema.object({
    milky: Schema.any(),
    satori: Schema.any(),
    ob11: Schema.any(),
    webui: Schema.any(),
    log: Schema.boolean(),
    ffmpeg: Schema.string(),
    musicCardSignUrl: Schema.string(),
    // The old name of musicCardSignUrl
    musicSignUrl: Schema.string(),
    msgCacheExpire: Schema.number()
  })

  protected async _handle(payload: LegacyConfig) {
    // After this reply goes out: changing the ob11 section restarts the OneBot connection carrying it, and
    // waiting for that here could hold the reply up behind its own server's shutdown. Without the token rule,
    // which set_config never had; only fields sent are changed
    setTimeout(() => {
      applyLegacyConfig(this.ctx, payload as Dict, { rules: false }).catch(e => this.ctx.logger.error('set_config', e))
    }, 0)
    return null
  }
}
