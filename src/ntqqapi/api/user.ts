import { callNTQQApi, GeneralCallResult, NTQQApiClass, NTQQApiMethod } from '../ntcall'
import { SelfInfo, User, UserDetailInfoByUin, UserDetailInfoByUinV2, UserDetailInfoListenerArg } from '../types'
import { ReceiveCmdS } from '../hook'
import { friends, groupMembers, getSelfUin } from '@/common/data'
import { CacheClassFuncAsync, log, getBuildVersion } from '@/common/utils'
import { getSession } from '@/ntqqapi/wrapper'
import { RequestUtil } from '@/common/utils/request'
import { NodeIKernelProfileService, UserDetailSource, ProfileBizType } from '../services'
import { NodeIKernelProfileListener } from '../listeners'
import { NTEventDispatch } from '@/common/utils/EventTask'
import { NTQQFriendApi } from './friend'
import { Time } from 'cosmokit'

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
      timeout: 10 * Time.second, // 10秒不一定够
    })
  }

  static async getSelfInfo() {
    return await callNTQQApi<SelfInfo>({
      className: NTQQApiClass.GLOBAL_DATA,
      methodName: NTQQApiMethod.SELF_INFO,
      timeout: 2 * Time.second,
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

  static async fetchUserDetailInfo(uid: string) {
    let info: UserDetailInfoListenerArg
    if (NTEventDispatch.initialised) {
      type EventService = NodeIKernelProfileService['fetchUserDetailInfo']
      type EventListener = NodeIKernelProfileListener['onUserDetailInfoChanged']
      const [_retData, profile] = await NTEventDispatch.CallNormalEvent
        <EventService, EventListener>
        (
          'NodeIKernelProfileService/fetchUserDetailInfo',
          'NodeIKernelProfileListener/onUserDetailInfoChanged',
          1,
          5000,
          (profile) => profile.uid === uid,
          'BuddyProfileStore',
          [uid],
          UserDetailSource.KSERVER,
          [ProfileBizType.KALL]
        )
      info = profile
    } else {
      const result = await callNTQQApi<{ info: UserDetailInfoListenerArg }>({
        methodName: 'nodeIKernelProfileService/fetchUserDetailInfo',
        cbCmd: 'nodeIKernelProfileListener/onUserDetailInfoChanged',
        afterFirstCmd: false,
        cmdCB: payload => payload.info.uid === uid,
        args: [
          {
            callFrom: 'BuddyProfileStore',
            uid: [uid],
            source: UserDetailSource.KSERVER,
            bizList: [ProfileBizType.KALL]
          },
          null
        ],
      })
      info = result.info
    }
    const ret: User = {
      ...info.simpleInfo.coreInfo,
      ...info.simpleInfo.status,
      ...info.simpleInfo.vasInfo,
      ...info.commonExt,
      ...info.simpleInfo.baseInfo,
      qqLevel: info.commonExt?.qqLevel,
      pendantId: ''
    }
    return ret
  }

  static async getUserDetailInfo(uid: string, getLevel = false, withBizInfo = true) {
    if (getBuildVersion() >= 26702) {
      return NTQQUserApi.fetchUserDetailInfo(uid)
    }
    type EventService = NodeIKernelProfileService['getUserDetailInfoWithBizInfo']
    type EventListener = NodeIKernelProfileListener['onProfileDetailInfoChanged']
    const [_retData, profile] = await NTEventDispatch.CallNormalEvent
      <EventService, EventListener>
      (
        'NodeIKernelProfileService/getUserDetailInfoWithBizInfo',
        'NodeIKernelProfileListener/onProfileDetailInfoChanged',
        2,
        5000,
        (profile) => profile.uid === uid,
        uid,
        [0]
      )
    return profile
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
    const uin = getSelfUin()
    const requestUrl = 'https://ssl.ptlogin2.qq.com/jump?ptlang=1033&clientuin=' + uin + '&clientkey=' + (await NTQQUserApi.getClientKey()).clientKey + '&u1=https%3A%2F%2Fuser.qzone.qq.com%2F' + uin + '%2Finfocenter&keyindex=19%27'
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
    const clientKeyData = await NTQQUserApi.getClientKey()
    if (clientKeyData.result !== 0) {
      throw new Error('获取clientKey失败')
    }
    const url = 'https://ssl.ptlogin2.qq.com/jump?ptlang=1033&clientuin=' + getSelfUin()
      + '&clientkey=' + clientKeyData.clientKey
      + '&u1=https%3A%2F%2Fh5.qzone.qq.com%2Fqqnt%2Fqzoneinpcqq%2Ffriend%3Frefresh%3D0%26clientuin%3D0%26darkMode%3D0&keyindex=' + clientKeyData.keyIndex
    return (await RequestUtil.HttpsGetCookies(url))?.skey
  }

  @CacheClassFuncAsync(1800 * 1000)
  static async getCookies(domain: string) {
    const ClientKeyData = await NTQQUserApi.forceFetchClientKey()
    const uin = getSelfUin()
    const requestUrl = 'https://ssl.ptlogin2.qq.com/jump?ptlang=1033&clientuin=' + uin + '&clientkey=' + ClientKeyData.clientKey + '&u1=https%3A%2F%2F' + domain + '%2F' + uin + '%2Finfocenter&keyindex=19%27'
    const cookies: { [key: string]: string; } = await RequestUtil.HttpsGetCookies(requestUrl)
    return cookies
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
    if (res?.result !== 0) {
      throw new Error(`获取Pskey失败: ${res?.errMsg}`)
    }
    return res.domainPskeyMap
  }

  static async getClientKey() {
    const session = getSession()
    return await session?.getTicketService().forceFetchClientKey('')!
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

  static async getUinByUidV1(Uid: string) {
    const ret = await NTEventDispatch.CallNoListenerEvent
      <(Uin: string[]) => Promise<{ uinInfo: Map<string, string> }>>(
        'NodeIKernelUixConvertService/getUin',
        5000,
        [Uid]
      )
    let uin = ret.uinInfo.get(Uid)
    if (!uin) {
      //从Buddy缓存获取Uin
      friends.forEach((t) => {
        if (t.uid == Uid) {
          uin = t.uin
        }
      })
    }
    if (!uin) {
      uin = (await NTQQUserApi.getUserDetailInfo(Uid)).uin //从QQ Native 转换
    }
    return uin
  }

  static async getUinByUidV2(Uid: string) {
    const session = getSession()
    let uin = (await session?.getProfileService().getUinByUid('FriendsServiceImpl', [Uid]))?.get(Uid)
    if (uin) return uin
    uin = (await session?.getGroupService().getUinByUids([Uid]))?.uins.get(Uid)
    if (uin) return uin
    uin = (await session?.getUixConvertService().getUin([Uid]))?.uinInfo.get(Uid)
    if (uin) return uin
    uin = (await NTQQFriendApi.getBuddyIdMapCache(true)).getKey(Uid) //从Buddy缓存获取Uin
    if (uin) return uin
    uin = (await NTQQFriendApi.getBuddyIdMap(true)).getKey(Uid)
    if (uin) return uin
    uin = (await NTQQUserApi.getUserDetailInfo(Uid)).uin //从QQ Native 转换
    return uin
  }

  static async getUinByUid(Uid: string) {
    if (getBuildVersion() >= 26702) {
      return await NTQQUserApi.getUinByUidV2(Uid)
    }
    return await NTQQUserApi.getUinByUidV1(Uid)
  }

  @CacheClassFuncAsync(3600 * 1000, 'ClientKey')
  static async forceFetchClientKey() {
    const session = getSession()
    return await session?.getTicketService().forceFetchClientKey('')!
  }
}
