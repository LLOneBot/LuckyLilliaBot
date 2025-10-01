import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

interface Response {
  token: number
}

export class GetCsrfToken extends BaseAction<{}, Response> {
  actionName = ActionName.GetCsrfToken

  protected async _handle() {
    const cookiesObject = await this.ctx.ntUserApi.getCookies('h5.qzone.qq.com')
    const bkn = this.ctx.ntWebApi.genBkn(cookiesObject.skey)
    return { token: +bkn }
  }
}
