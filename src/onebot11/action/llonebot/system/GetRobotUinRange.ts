import { BaseAction } from '../../BaseAction'
import { ActionName } from '../../types'
import { Dict } from 'cosmokit'

export class GetRobotUinRange extends BaseAction<{}, Dict[]> {
  actionName = ActionName.GetRobotUinRange

  async _handle() {
    return await this.ctx.ntUserApi.getRobotUinRange()
  }
}
