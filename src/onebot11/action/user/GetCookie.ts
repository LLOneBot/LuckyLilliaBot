import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'

interface Response {
  cookies: string
  bkn: string
}

interface Payload {
  domain: string
}

export class GetCookies extends BaseAction<Payload, Response> {
  actionName = ActionName.GetCookies

  protected async _handle(payload: Payload) {
    if (!payload.domain) {
      throw '缺少参数 domain'
    }
    const cookiesObject = await this.ctx.ntUserApi.getCookies(payload.domain)
    //把获取到的cookiesObject转换成 k=v; 格式字符串拼接在一起
    const cookies = Object.entries(cookiesObject).map(([key, value]) => `${key}=${value}`).join('; ')
    const bkn = cookiesObject.skey ? this.ctx.ntWebApi.genBkn(cookiesObject.skey) : ''
    return { cookies, bkn }
  }
}
