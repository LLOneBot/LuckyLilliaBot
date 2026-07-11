import { BaseAction } from '../../BaseAction'
import { ActionName } from '../../types'
import { Dict } from 'cosmokit'

export class GetRobotUinRange extends BaseAction<{}, Dict[]> {
  actionName = ActionName.GetRobotUinRange

  async _handle() {
    return [
      {
        minUin: '3328144510',
        maxUin: '3328144510'
      },
      {
        minUin: '2854196301',
        maxUin: '2854216399'
      },
      {
        minUin: '66600000',
        maxUin: '66600000'
      },
      {
        minUin: '3889000000',
        maxUin: '3889999999'
      },
      {
        minUin: '4010000000',
        maxUin: '4019999999'
      }
    ]
  }
}
