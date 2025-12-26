import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  domain: string
}

interface Response {
  cookies: string
  bkn: string
}

export class GetCookies extends BaseAction<Payload, Response> {
  actionName = ActionName.GetCookies
  payloadSchema = Schema.object({
    domain: Schema.string().required()
  })

  protected async _handle(payload: Payload) {
    const blackList = ['pay.qq.com']
    if (blackList.includes(payload.domain)) {
      throw new Error('该域名禁止获取cookie')
    }
    const cookiesObject = await this.ctx.ntUserApi.getCookies(payload.domain)
    if (!cookiesObject.p_skey) {
      const pSkey = (await this.ctx.ntUserApi.getPSkey([payload.domain])).domainPskeyMap.get(payload.domain)
      if (pSkey) {
        cookiesObject.p_skey = pSkey
      }
    }
    //把获取到的cookiesObject转换成 k=v; 格式字符串拼接在一起
    const cookies = Object.entries(cookiesObject).map(([key, value]) => `${key}=${value}`).join('; ')
    const bkn = cookiesObject.skey ? this.ctx.ntWebApi.genBkn(cookiesObject.skey) : ''
    return { cookies, bkn }
  }
}
