import BaseAction from '../BaseAction'
import { OB11Status } from '../../types'
import { ActionName } from '../types'
import { selfInfo } from '@/common/globalVars'

export default class GetStatus extends BaseAction<null, OB11Status> {
  actionName = ActionName.GetStatus

  protected async _handle(): Promise<OB11Status> {
    return {
      online: selfInfo.online!,
      good: true,
    }
  }
}
