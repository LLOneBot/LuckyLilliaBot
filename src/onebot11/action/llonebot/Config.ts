import BaseAction from '../BaseAction'
import { Config } from '@/common/types'
import { ActionName } from '../types'
import { getConfigUtil } from '@/common/config'

export class GetConfigAction extends BaseAction<null, Config> {
  actionName = ActionName.GetConfig
  protected async _handle(payload: null): Promise<Config> {
    return getConfigUtil().getConfig()
  }
}

export class SetConfigAction extends BaseAction<Config, void> {
  actionName = ActionName.SetConfig
  protected async _handle(payload: Config): Promise<void> {
    getConfigUtil().setConfig(payload)
  }
}
