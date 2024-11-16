import { BaseAction } from '@/onebot11/action/BaseAction'
import { ActionName } from '@/onebot11/action/types'

export class SetRestart extends BaseAction<null, void> {
  actionName = ActionName.SetRestart

  protected async _handle() {
    await this.ctx.ntSystemApi.restart()
  }
}
