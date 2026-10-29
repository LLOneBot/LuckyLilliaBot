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
    const cookiesObject = await this.ctx.ntWebApi.getCookies(payload.domain)
    const cookies = Object.entries(cookiesObject).map(([key, value]) => `${key}=${value}`).join('; ')
    const bkn = cookiesObject.skey ? this.ctx.ntWebApi.genBkn(cookiesObject.skey) : ''
    return { cookies, csrf_token: +bkn }
  }
}
