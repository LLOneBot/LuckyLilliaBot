import BaseAction from '../BaseAction'
import { NTQQUserApi, WebApi } from '../../../ntqqapi/api'
import { groups, selfInfo } from '../../../common/data'
import { ActionName } from '../types'

interface Payload {
  domain: string
}

export class GetCookies extends BaseAction<Payload, { cookies: string; bkn: string }> {
  actionName = ActionName.GetCookies

  protected async _handle(payload: Payload) {
    const domain = payload.domain || 'qun.qq.com'
    if (domain.endsWith("qzone.qq.com")) {
      const _Skey = await NTQQUserApi.getSkey() as string;
      // 兼容整个 *.qzone.qq.com
      let data = (await NTQQUserApi.getQzoneCookies());
      const Bkn = WebApi.genBkn(data.p_skey);
      const CookieValue = 'p_skey=' + data.p_skey + '; skey=' + data.skey + '; p_uin=o' + selfInfo.uin + '; uin=o' + selfInfo.uin;
      return { bkn: WebApi.genBkn(data.p_skey), cookies: CookieValue };
    }
    return NTQQUserApi.getCookies(domain);
  }
}
