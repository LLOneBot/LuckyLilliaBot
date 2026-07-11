import { BaseAction } from '../../BaseAction'
import { ActionName } from '../../types'

export class FetchCustomFace extends BaseAction<{}, string[]> {
  actionName = ActionName.FetchCustomFace

  async _handle(payload: {}) {
    const ret = await this.ctx.ntMsgApi.getCustomFaceList()
    if (ret.retCode !== 0) {
      throw new Error(ret.errMsg)
    }
    return ret.emojiInfoList.map((e) => e.url)
  }
}
