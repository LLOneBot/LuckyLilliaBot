import { callNTQQApi, GeneralCallResult, NTQQApiClass, NTQQApiMethod } from '../ntcall'
import { Group, SelfInfo, User } from '../types'
import { ReceiveCmdS } from '../hook'
import { selfInfo, uidMaps } from '../../common/data'
import { NTQQWindowApi, NTQQWindows } from './window'
import { isQQ998, log, sleep } from '../../common/utils'

let userInfoCache: Record<string, User> = {} // uid: User

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
  static async getUserDetailInfo(uid: string, getLevel = false) {
    // this.getUserInfo(uid);
    let methodName = !isQQ998 ? NTQQApiMethod.USER_DETAIL_INFO : NTQQApiMethod.USER_DETAIL_INFO_WITH_BIZ_INFO
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
  static async getSkey(groupName: string, groupCode: string): Promise<{ data: string }> {
    return await NTQQWindowApi.openWindow<{ data: string }>(
      NTQQWindows.GroupHomeWorkWindow,
      [
        {
          groupName,
          groupCode,
          source: 'funcbar',
        },
      ],
      ReceiveCmdS.SKEY_UPDATE,
      1,
    )
    // return await callNTQQApi<string>({
    //     className: NTQQApiClass.GROUP_HOME_WORK,
    //     methodName: NTQQApiMethod.UPDATE_SKEY,
    //     args: [
    //         {
    //             domain: "qun.qq.com"
    //         }
    //     ]
    // })
    // return await callNTQQApi<GeneralCallResult>({
    //     methodName: NTQQApiMethod.GET_SKEY,
    //     args: [
    //         {
    //             "domains": [
    //                 "qzone.qq.com",
    //                 "qlive.qq.com",
    //                 "qun.qq.com",
    //                 "gamecenter.qq.com",
    //                 "vip.qq.com",
    //                 "qianbao.qq.com",
    //                 "qidian.qq.com"
    //             ],
    //             "isForNewPCQQ": false
    //         },
    //         null
    //     ]
    // })
  }

  static async getCookie(group: Group) {
    let cookies = await this.getCookieWithoutSkey()
    let skey = ''
    for (let i = 0; i < 2; i++) {
      skey = (await this.getSkey(group.groupName, group.groupCode)).data
      skey = skey.trim()
      if (skey) {
        break
      }
      await sleep(1000)
    }
    if (!skey) {
      throw new Error('获取skey失败')
    }
    const bkn = NTQQUserApi.genBkn(skey)
    cookies = cookies.replace('skey=;', `skey=${skey};`)
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
}
