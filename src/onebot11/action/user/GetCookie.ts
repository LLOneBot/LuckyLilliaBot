import BaseAction from '../BaseAction'
import { NTQQUserApi, WebApi } from '@/ntqqapi/api'
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
    const cookiesObject = await NTQQUserApi.getCookies(payload.domain)
    //把获取到的cookiesObject转换成 k=v; 格式字符串拼接在一起
    const cookies = Object.entries(cookiesObject).map(([key, value]) => `${key}=${value}`).join('; ')
    const bkn = WebApi.genBkn(cookiesObject.p_skey)
    return { cookies, bkn }
  }
}
