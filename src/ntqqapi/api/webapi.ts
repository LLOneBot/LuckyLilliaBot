import { groups } from '../../common/data'
import { log } from '../../common/utils'
import { NTQQUserApi } from './user'

export class WebApi {
  private static bkn: string
  private static skey: string
  private static pskey: string
  private static cookie: string
  private defaultHeaders: Record<string, string> = {
    'User-Agent': 'QQ/8.9.28.635 CFNetwork/1312 Darwin/21.0.0',
  }

  constructor() {}

  public async addGroupDigest(groupCode: string, msgSeq: string) {
    const url = `https://qun.qq.com/cgi-bin/group_digest/cancel_digest?random=665&X-CROSS-ORIGIN=fetch&group_code=${groupCode}&msg_seq=${msgSeq}&msg_random=444021292`
    const res = await this.request(url)
    return await res.json()
  }

  public async getGroupDigest(groupCode: string) {
    const url = `https://qun.qq.com/cgi-bin/group_digest/digest_list?random=665&X-CROSS-ORIGIN=fetch&group_code=${groupCode}&page_start=0&page_limit=20`
    const res = await this.request(url)
    log(res.headers)
    return await res.json()
  }

  private genBkn(sKey: string) {
    return NTQQUserApi.genBkn(sKey)
  }
  private async init() {
    if (!WebApi.bkn) {
      const group = groups[0]
      WebApi.skey = (await NTQQUserApi.getSkey(group.groupName, group.groupCode)).data
      WebApi.bkn = this.genBkn(WebApi.skey)
      let cookie = await NTQQUserApi.getCookieWithoutSkey()
      const pskeyRegex = /p_skey=([^;]+)/
      const match = cookie.match(pskeyRegex)
      const pskeyValue = match ? match[1] : null
      WebApi.pskey = pskeyValue
      if (cookie.indexOf('skey=;') !== -1) {
        cookie = cookie.replace('skey=;', `skey=${WebApi.skey};`)
      }
      WebApi.cookie = cookie
      // for(const kv of WebApi.cookie.split(";")){
      //     const [key, value] = kv.split("=");
      // }
      //     log("set cookie", key, value)
      //     await session.defaultSession.cookies.set({
      //         url: 'https://qun.qq.com', // 你要请求的域名
      //         name: key.trim(),
      //         value: value.trim(),
      //         expirationDate: Date.now() / 1000 + 300000, // Cookie 过期时间，例如设置为当前时间之后的300秒
      //     });
      // }
    }
  }

  private async request(url: string, method: 'GET' | 'POST' = 'GET', headers: Record<string, string> = {}) {
    await this.init()
    url += '&bkn=' + WebApi.bkn
    let _headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...headers,
      Cookie: WebApi.cookie,
      credentials: 'include',
    }
    log('request', url, _headers)
    const options = {
      method: method,
      headers: _headers,
    }
    return fetch(url, options)
  }
}
