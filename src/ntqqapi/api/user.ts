import { callNTQQApi, GeneralCallResult, NTQQApiClass, NTQQApiMethod } from '../ntcall'
import { Group, SelfInfo, User } from '../types'
import { ReceiveCmdS } from '../hook'
import { selfInfo, uidMaps } from '../../common/data'
import { cacheFunc, isQQ998, log, sleep } from '../../common/utils'
import { wrapperApi } from '@/ntqqapi/wrapper'
import { RequestUtil } from '@/common/utils/request'

let userInfoCache: Record<string, User> = {} // uid: User

export interface ClientKeyData extends GeneralCallResult {
  url: string;
  keyIndex: string;
  clientKey: string;
  expireTime: string;
}

export class NTQQUserApi {
  static async setQQAvatar(filePath: string) {
    return await callNTQQApi<GeneralCallResult>({
      methodName: NTQQApiMethod.SET_QQ_AVATAR,
      args: [
        {
          path: filePath,
        },
        null,
      ],
      timeoutSecond: 10, // 10秒不一定够
    })
  }

  static async getSelfInfo() {
    return await callNTQQApi<SelfInfo>({
      className: NTQQApiClass.GLOBAL_DATA,
      methodName: NTQQApiMethod.SELF_INFO,
      timeoutSecond: 2,
    })
  }

  static async getUserInfo(uid: string) {
    const result = await callNTQQApi<{ profiles: Map<string, User> }>({
      methodName: NTQQApiMethod.USER_INFO,
      args: [{ force: true, uids: [uid] }, undefined],
      cbCmd: ReceiveCmdS.USER_INFO,
    })
    return result.profiles.get(uid)
  }

  static async getUserDetailInfo(uid: string, getLevel = false, withBizInfo = true) {
    // this.getUserInfo(uid);
    let methodName = !isQQ998 ? NTQQApiMethod.USER_DETAIL_INFO : NTQQApiMethod.USER_DETAIL_INFO_WITH_BIZ_INFO
    if (!withBizInfo) {
      methodName = NTQQApiMethod.USER_DETAIL_INFO
    }
    const fetchInfo = async () => {
      const result = await callNTQQApi<{ info: User }>({
        methodName,
        cbCmd: ReceiveCmdS.USER_DETAIL_INFO,
        afterFirstCmd: false,
        cmdCB: (payload) => {
          const success = payload.info.uid == uid
          // log("get user detail info", success, uid, payload)
          return success
        },
        args: [
          {
            uid,
          },
          null,
        ],
      })
      const info = result.info
      if (info?.uin) {
        uidMaps[info.uid] = info.uin
      }
      return info
    }
    // 首次请求两次才能拿到的等级信息
    if (!userInfoCache[uid] && getLevel) {
      await fetchInfo()
      await sleep(1000)
    }
    let userInfo = await fetchInfo()
    userInfoCache[uid] = userInfo
    return userInfo
  }

  // return 'p_uin=o0xxx; p_skey=orXDssiGF8axxxxxxxxxxxxxx_; skey='
  static async getCookieWithoutSkey() {
    return await callNTQQApi<string>({
      className: NTQQApiClass.GROUP_HOME_WORK,
      methodName: NTQQApiMethod.UPDATE_SKEY,
      args: [
        {
          domain: 'qun.qq.com',
        },
      ],
    })
  }
  static async getQzoneCookies() {
    const requestUrl = 'https://ssl.ptlogin2.qq.com/jump?ptlang=1033&clientuin=' + selfInfo.uin + '&clientkey=' + (await this.getClientKey()).clientKey + '&u1=https%3A%2F%2Fuser.qzone.qq.com%2F' + selfInfo.uin + '%2Finfocenter&keyindex=19%27'
    let cookies: { [key: string]: string; } = {};
    try {
      cookies = await RequestUtil.HttpsGetCookies(requestUrl);
    } catch (e: any) {
      log('获取QZone Cookies失败', e)
      cookies = {}
    }
    return cookies;
  }
  static async getSkey(): Promise<string> {
    const clientKeyData = await this.getClientKey()
    if (clientKeyData.result !== 0) {
      throw new Error('获取clientKey失败')
    }
    const url = 'https://ssl.ptlogin2.qq.com/jump?ptlang=1033&clientuin=' + selfInfo.uin
      + '&clientkey=' + clientKeyData.clientKey
      + '&u1=https%3A%2F%2Fh5.qzone.qq.com%2Fqqnt%2Fqzoneinpcqq%2Ffriend%3Frefresh%3D0%26clientuin%3D0%26darkMode%3D0&keyindex=' + clientKeyData.keyIndex;
    return (await RequestUtil.HttpsGetCookies(url))?.skey;
  }

  @cacheFunc(60 * 30 * 1000)
  static async getCookies(domain: string) {
    if (domain.endsWith("qzone.qq.com")) {
      let data = (await NTQQUserApi.getQzoneCookies());
      const CookieValue = 'p_skey=' + data.p_skey + '; skey=' + data.skey + '; p_uin=o' + selfInfo.uin + '; uin=o' + selfInfo.uin;
      return { bkn: NTQQUserApi.genBkn(data.p_skey), cookies: CookieValue };
    }
    const skey = await this.getSkey();
    const pskey = (await this.getPSkey([domain])).get(domain);
    if (!pskey || !skey) {
      throw new Error('获取Cookies失败')
    }
    const bkn = NTQQUserApi.genBkn(skey)
    const cookies = `p_skey=${pskey}; skey=${skey}; p_uin=o${selfInfo.uin}; uin=o${selfInfo.uin}`;
    return { cookies, bkn }
  }

  static genBkn(sKey: string) {
    sKey = sKey || ''
    let hash = 5381

    for (let i = 0; i < sKey.length; i++) {
      const code = sKey.charCodeAt(i)
      hash = hash + (hash << 5) + code
    }

    return (hash & 0x7fffffff).toString()
  }

  static async getPSkey(domains: string[]): Promise<Map<string, string>> {
    const res = await wrapperApi.NodeIQQNTWrapperSession.getTipOffService().getPskey(domains, true)
    if (res.result !== 0) {
      throw new Error(`获取Pskey失败: ${res.errMsg}`)
    }
    return res.domainPskeyMap
  }

  static async getClientKey(): Promise<ClientKeyData> {
    return await wrapperApi.NodeIQQNTWrapperSession.getTicketService().forceFetchClientKey('')
  }

}
