import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'
import { selfInfo } from '@/common/globalVars'
import { Dict } from 'cosmokit'

export class GetProfileLike extends BaseAction<void, Dict[]> {
  actionName = ActionName.GetProfileLike

  async _handle() {
    const ret = await this.ctx.ntUserApi.getProfileLike(selfInfo.uid)
    const listdata = ret.info.userLikeInfos[0].favoriteInfo.userInfos
    for (const item of listdata) {
      item.uin = Number(await this.ctx.ntUserApi.getUinByUid(item.uid)) || 0
    }
    return listdata
  }
}
