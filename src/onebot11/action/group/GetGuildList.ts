import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

export default class GetGuildList extends BaseAction<{}, null> {
  actionName = ActionName.GetGuildList

  protected async _handle() {
    return null
  }
}
