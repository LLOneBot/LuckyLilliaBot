import { OB11User } from '../../types'
import BaseAction from '../BaseAction'
import { ActionName } from '../types'
import { selfInfo } from '@/common/globalVars'

class GetLoginInfo extends BaseAction<null, OB11User> {
  actionName = ActionName.GetLoginInfo

  protected async _handle(payload: null) {
    return {
      user_id: parseInt(selfInfo.uin),
      nickname: await this.ctx.ntUserApi.getSelfNick(true)
    }
  }
}

export default GetLoginInfo
