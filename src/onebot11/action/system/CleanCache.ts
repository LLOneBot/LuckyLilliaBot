import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

export default class CleanCache extends BaseAction<{}, null> {
  actionName = ActionName.CleanCache

  protected async _handle() {
    // TODO: 删除 LLBot 临时文件目录内所有文件
    return null
  }
}
