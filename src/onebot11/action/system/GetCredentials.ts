import { BaseAction, Schema } from '../BaseAction'
import { ActionName } from '../types'

interface Payload {
  domain: string
}

interface Response {
  cookies: string
  csrf_token: number
}

export class GetCredentials extends BaseAction<Payload, Response> {
  actionName = ActionName.GetCredentials
  payloadSchema = Schema.object({
    domain: Schema.string().required()
  })

  protected async _handle(payload: Payload) {
    const cookiesObject = await this.ctx.ntUserApi.getCookies(payload.domain)
    //把获取到的cookiesObject转换成 k=v; 格式字符串拼接在一起
    const cookies = Object.entries(cookiesObject).map(([key, value]) => `${key}=${value}`).join('; ')
    const bkn = cookiesObject.skey ? this.ctx.ntWebApi.genBkn(cookiesObject.skey) : ''
    return { cookies, csrf_token: +bkn }
  }
}
