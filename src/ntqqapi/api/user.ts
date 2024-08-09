import { callNTQQApi, GeneralCallResult, NTQQApiClass, NTQQApiMethod } from '../ntcall'
import { SelfInfo, User, UserDetailInfoByUin, UserDetailInfoByUinV2 } from '../types'
import { ReceiveCmdS } from '../hook'
import { selfInfo, uidMaps, friends, groupMembers } from '@/common/data'
import { cacheFunc, isQQ998, log, sleep, getBuildVersion } from '@/common/utils'
import { getSession } from '@/ntqqapi/wrapper'
import { RequestUtil } from '@/common/utils/request'
import { NodeIKernelProfileService, UserDetailSource, ProfileBizType } from '../services'
import { NodeIKernelProfileListener } from '../listeners'
import { NTEventDispatch } from '@/common/utils/EventTask'
import { NTQQFriendApi } from './friend'

const userInfoCache: Record<string, User> = {} // uid: User

export interface ClientKeyData extends GeneralCallResult {
  url: string
  keyIndex: string
  clientKey: string
  expireTime: string
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

  /** 26702 */
  static async fetchUserDetailInfo(uid: string) {
    type EventService = NodeIKernelProfileService['fetchUserDetailInfo']
    type EventListener = NodeIKernelProfileListener['onUserDetailInfoChanged']
    const [_retData, profile] = await NTEventDispatch.CallNormalEvent
      <EventService, EventListener>
      (
        'NodeIKernelProfileService/fetchUserDetailInfo',
        'NodeIKernelProfileListener/onUserDetailInfoChanged',
        1,
        5000,
        (profile) => {
          if (profile.uid === uid) {
            return true
          }
          return false
        },
        'BuddyProfileStore',
        [
          uid
        ],
        UserDetailSource.KSERVER,
        [
          ProfileBizType.KALL
        ]
      )
    const RetUser: User = {
      ...profile.simpleInfo.coreInfo,
      ...profile.simpleInfo.status,
      ...profile.simpleInfo.vasInfo,
      ...profile.commonExt,
      ...profile.simpleInfo.baseInfo,
      qqLevel: profile.commonExt.qqLevel,
      pendantId: ''
    }
    return RetUser
  }

  static async getUserDetailInfo(uid: string, getLevel = false, withBizInfo = true) {
    if (getBuildVersion() >= 26702) {
      return this.fetchUserDetailInfo(uid)
    }
    // this.getUserInfo(uid)
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
    const userInfo = await fetchInfo()
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
    let cookies: { [key: string]: string } = {}
    try {
      cookies = await RequestUtil.HttpsGetCookies(requestUrl)
    } catch (e: any) {
      log('获取QZone Cookies失败', e)
      cookies = {}
    }
    return cookies
  }
  static async getSkey(): Promise<string> {
    const clientKeyData = await this.getClientKey()
    if (clientKeyData.result !== 0) {
      throw new Error('获取clientKey失败')
    }
    const url = 'https://ssl.ptlogin2.qq.com/jump?ptlang=1033&clientuin=' + selfInfo.uin
      + '&clientkey=' + clientKeyData.clientKey
      + '&u1=https%3A%2F%2Fh5.qzone.qq.com%2Fqqnt%2Fqzoneinpcqq%2Ffriend%3Frefresh%3D0%26clientuin%3D0%26darkMode%3D0&keyindex=' + clientKeyData.keyIndex
    return (await RequestUtil.HttpsGetCookies(url))?.skey
  }

  @cacheFunc(60 * 30 * 1000)
  static async getCookies(domain: string) {
    if (domain.endsWith("qzone.qq.com")) {
      let data = (await NTQQUserApi.getQzoneCookies())
      const CookieValue = 'p_skey=' + data.p_skey + '; skey=' + data.skey + '; p_uin=o' + selfInfo.uin + '; uin=o' + selfInfo.uin
      return { bkn: NTQQUserApi.genBkn(data.p_skey), cookies: CookieValue }
    }
    const skey = await this.getSkey()
    const pskey = (await this.getPSkey([domain])).get(domain)
    if (!pskey || !skey) {
      throw new Error('获取Cookies失败')
    }
    const bkn = NTQQUserApi.genBkn(skey)
    const cookies = `p_skey=${pskey}; skey=${skey}; p_uin=o${selfInfo.uin}; uin=o${selfInfo.uin}`
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
    const session = getSession()
    const res = await session?.getTipOffService().getPskey(domains, true)
    if (res.result !== 0) {
      throw new Error(`获取Pskey失败: ${res.errMsg}`)
    }
    return res.domainPskeyMap
  }

  static async getClientKey(): Promise<ClientKeyData> {
    const session = getSession()
    return await session?.getTicketService().forceFetchClientKey('')
  }

  static async like(uid: string, count = 1): Promise<{ result: number, errMsg: string, succCounts: number }> {
    const session = getSession()
    return session?.getProfileLikeService().setBuddyProfileLike({
      friendUid: uid,
      sourceId: 71,
      doLikeCount: count,
      doLikeTollCount: 0
    })!
  }

  static async getUidByUinV1(Uin: string) {
    const session = getSession()
    // 通用转换开始尝试
    let uid = (await session?.getUixConvertService().getUid([Uin]))?.uidInfo.get(Uin)
    // Uid 好友转
    if (!uid) {
      friends.forEach((t) => {
        if (t.uin == Uin) {
          uid = t.uid
        }
      })
    }
    //Uid 群友列表转
    if (!uid) {
      for (let groupMembersList of groupMembers.values()) {
        for (let GroupMember of groupMembersList.values()) {
          if (GroupMember.uin == Uin) {
            uid = GroupMember.uid
          }
        }
      }
    }
    if (!uid) {
      let unveifyUid = (await NTQQUserApi.getUserDetailInfoByUin(Uin)).info.uid;//从QQ Native 特殊转换 方法三
      if (unveifyUid.indexOf('*') == -1) {
        uid = unveifyUid
      }
    }
    return uid
  }

  static async getUidByUinV2(Uin: string) {
    const session = getSession()
    let uid = (await session?.getProfileService().getUidByUin('FriendsServiceImpl', [Uin]))?.get(Uin)
    if (uid) return uid
    uid = (await session?.getGroupService().getUidByUins([Uin]))?.uids.get(Uin)
    if (uid) return uid
    uid = (await session?.getUixConvertService().getUid([Uin]))?.uidInfo.get(Uin)
    if (uid) return uid
    console.log((await NTQQFriendApi.getBuddyIdMapCache(true)))
    uid = (await NTQQFriendApi.getBuddyIdMapCache(true)).getValue(Uin)//从Buddy缓存获取Uid
    if (uid) return uid
    uid = (await NTQQFriendApi.getBuddyIdMap(true)).getValue(Uin)
    if (uid) return uid
    let unveifyUid = (await NTQQUserApi.getUserDetailInfoByUinV2(Uin)).detail.uid//从QQ Native 特殊转换
    if (unveifyUid.indexOf('*') == -1) uid = unveifyUid
    //if (uid) return uid
    return uid
  }

  static async getUidByUin(Uin: string) {
    if (getBuildVersion() >= 26702) {
      return await NTQQUserApi.getUidByUinV2(Uin)
    }
    return await NTQQUserApi.getUidByUinV1(Uin)
  }

  static async getUserDetailInfoByUinV2(Uin: string) {
    return await NTEventDispatch.CallNoListenerEvent
      <(Uin: string) => Promise<UserDetailInfoByUinV2>>(
        'NodeIKernelProfileService/getUserDetailInfoByUin',
        5000,
        Uin
      )
  }
  static async getUserDetailInfoByUin(Uin: string) {
    return NTEventDispatch.CallNoListenerEvent
      <(Uin: string) => Promise<UserDetailInfoByUin>>(
        'NodeIKernelProfileService/getUserDetailInfoByUin',
        5000,
        Uin
      )
  }
}
