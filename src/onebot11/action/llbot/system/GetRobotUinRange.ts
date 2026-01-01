import { BaseAction } from '../../BaseAction'
import { ActionName } from '../../types'
import { Dict } from 'cosmokit'

export class GetRobotUinRange extends BaseAction<{}, Dict[]> {
  actionName = ActionName.GetRobotUinRange

  async _handle() {
    const res = await this.ctx.ntUserApi.getRobotUinRange()
    if (res.result !== 0) {
      throw new Error(res.errMsg)
    }
    return res.response.robotUinRanges
  }
}
