import { MiniProfile, ProfileBizType, SimpleInfo, UserDetailInfo, UserDetailSource } from '../types'
import { invoke } from '../ntcall'
import { RequestUtil } from '@/common/utils/request'
import { Time } from 'cosmokit'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { uidUinBidiMap } from '@/ntqqapi/cache'
import { ReceiveCmdS } from '../hook'

declare module 'cordis' {
  interface Context {
    ntUserApi: NTQQUserApi
  }
}

export class NTQQUserApi extends Service {
  static inject = ['ntGroupApi']

  constructor(protected ctx: Context) {
    super(ctx, 'ntUserApi', true)
  }

  async setSelfAvatar(path: string) {
    return await invoke(
      'nodeIKernelProfileService/setHeader',
      [path],
      {
        timeout: 10 * Time.second, // 10秒不一定够？
      },
    )
  }

  async getUidByUin(uin: string, groupCode?: string) {
    const uid = uidUinBidiMap.getKey(uin)
    if (uid) return uid

    const funcs = [
      async () => {
        return (await invoke('nodeIKernelUixConvertService/getUid', [[uin]]))?.uidInfo.get(uin)
      },
      async () => {
        return (await invoke('nodeIKernelGroupService/getUidByUins', [[uin]])).uids.get(uin)
      },
      async () => {
        return (await invoke('nodeIKernelProfileService/getUidByUin', ['FriendsServiceImpl', [uin]]))?.get(uin)
      },
      async () => {
        return (await this.getUserDetailInfoByUin(uin)).detail.uid
      },
      async () => {
        if (groupCode) {
          const groupMembers = await this.ctx.ntGroupApi.getGroupMembers(groupCode)
          return groupMembers.values().find(e => e.uin === uin)?.uid
        }
      }
    ]

    for (const f of funcs) {
      try {
        const uid = await f()
        if (uid && !uid.includes('****')) {
          uidUinBidiMap.set(uid, uin)
          return uid
        }
      } catch (e) {
        this.ctx.logger.error('get uid by uin filed', e)
      }
    }
    return ''
  }

  async getUserDetailInfoByUin(uin: string) {
    return await invoke('nodeIKernelProfileService/getUserDetailInfoByUin', [uin])
  }

  async getUinByUid(uid: string): Promise<string> {
    const uin = uidUinBidiMap.get(uid)
    if (uin) return uin

    const funcs = [
      async () => {
        const uin = (await invoke('nodeIKernelUixConvertService/getUin', [[uid]])).uinInfo.get(uid) || ''
        this.ctx.logger.info('nodeIKernelUixConvertService/getUin', uin)
        return uin
      },
      async () => {
        const uin = (await this.fetchUserDetailInfo(uid))?.uin
        this.ctx.logger.info('fetchUserDetailInfo', uin)
        return uin
      },
    ]

    for (const f of funcs) {
      try {
        const result = await f()
        if (result) {
          uidUinBidiMap.set(uid, result)
          return result
        }
      } catch (e) {
        this.ctx.logger.error('get uin filed', e)
      }
    }

    return ''
  }

  // 这个会从服务器拉取，比较可靠
  async fetchUserDetailInfo(uid: string) {
    const result = await invoke(
      'nodeIKernelProfileService/fetchUserDetailInfo',
      [
        'BuddyProfileStore', // callFrom
        [uid],
        UserDetailSource.KSERVER, // source
        [ProfileBizType.KALL], //bizList
      ],
    )
    return result.detail.get(uid)!
  }

  async getUserDetailInfoWithBizInfo(uid: string) {
    const result = await invoke<UserDetailInfo>(
      'nodeIKernelProfileService/getUserDetailInfoWithBizInfo',
      [
        uid,
        [0],
      ],
      {
        resultCmd: 'nodeIKernelProfileListener/onUserDetailInfoChanged',
        resultCb: payload => payload.simpleInfo.uid === uid,
      },
    )
    return result
  }

  async getUserSimpleInfo(uid: string, force = true) {
    const data = await invoke<Map<string, SimpleInfo>>(
      'nodeIKernelProfileService/getUserSimpleInfo',
      [
        force,
        [uid],
      ],
      {
        resultCmd: ReceiveCmdS.USER_INFO,
        resultCb: payload => payload.has(uid),
      },
    )
    return data.get(uid)!
  }

  async getCoreAndBaseInfo(uids: string[]) {
    return await invoke(
      'nodeIKernelProfileService/getCoreAndBaseInfo',
      [
        'nodeStore',
        uids,
      ],
    )
  }

  async getBuddyNick(uid: string): Promise<string> {
    const data = await invoke<Map<string, string>>('nodeIKernelBuddyService/getBuddyNick', [[uid]])
    return data.get(uid) || ''
  }

  async getCookies(domain: string) {
    const clientKeyData = await this.forceFetchClientKey()
    if (clientKeyData?.result !== 0) {
      throw new Error('获取clientKey失败')
    }
    const uin = selfInfo.uin
    const requestUrl = 'https://ssl.ptlogin2.qq.com/jump?ptlang=1033&clientuin=' + uin + '&clientkey=' + clientKeyData.clientKey + '&u1=https%3A%2F%2F' + domain + '%2F' + uin + '%2Finfocenter&keyindex=19%27'
    const cookies: { [key: string]: string } = await RequestUtil.HttpsGetCookies(requestUrl)
    return cookies
  }

  async getPSkey(domains: string[]) {
    return await invoke('nodeIKernelTipOffService/getPskey', [
      domains,
      true, // isFromNewPCQQ
    ])
  }

  async like(uid: string, count = 1) {
    return await invoke(
      'nodeIKernelProfileLikeService/setBuddyProfileLike',
      [{

        friendUid: uid,
        sourceId: 71,
        doLikeCount: count,
        doLikeTollCount: 0,
      }],
    )
  }

  async forceFetchClientKey() {
    return await invoke('nodeIKernelTicketService/forceFetchClientKey', [''])
  }

  async getSelfNick(refresh = true) {
    if ((refresh || !selfInfo.nick) && selfInfo.uid) {
      // const data = await this.getUserSimpleInfo(selfInfo.uid, refresh)
      selfInfo.nick = await this.getBuddyNick(selfInfo.uid)
    }
    return selfInfo.nick
  }

  async setSelfStatus(status: number, extStatus: number, batteryStatus: number) {
    return await invoke('nodeIKernelMsgService/setStatus', [
      {
        status,
        extStatus,
        batteryStatus,
      },
    ])
  }

  async getProfileLike(uid: string, start = 0, limit = 20) {
    return await invoke('nodeIKernelProfileLikeService/getBuddyProfileLike', [
      {
        friendUids: [uid],
        basic: 1,
        vote: 0,
        favorite: 1,
        userProfile: 1,
        type: 3,
        start,
        limit,
      },
    ])
  }

  async getProfileLikeMe(uid: string, start = 0, limit = 20) {
    return await invoke('nodeIKernelProfileLikeService/getBuddyProfileLike', [
      {
        friendUids: [uid],
        basic: 1,
        vote: 1,
        favorite: 0,
        userProfile: 1,
        type: 2,
        start,
        limit,
      },
    ])
  }

  async getRobotUinRange() {
    const data = await invoke(
      'nodeIKernelRobotService/getRobotUinRange',
      [
        {
          justFetchMsgConfig: '1',
          type: 1,
          version: 0,
          aioKeywordVersion: 0,
        },
      ],
    )
    return data.response.robotUinRanges
  }

  async quitAccount() {
    return await invoke(
      'quitAccount',
      [],
    )
  }

  async modifySelfProfile(profile: MiniProfile) {
    return await invoke('nodeIKernelProfileService/modifyDesktopMiniProfile', [profile])
  }

  async getRecentContactListSnapShot(count: number) {
    return await invoke('nodeIKernelRecentContactService/getRecentContactListSnapShot', [count])
  }

  async getUserInfoCompatible(uid: string) {
    const funcs = [
      () => this.getUserSimpleInfo(uid, false),
      () => this.getUserSimpleInfo(uid, true),
      async () => (await this.fetchUserDetailInfo(uid)).simpleInfo,
      async () => (await this.getUserDetailInfoWithBizInfo(uid)).simpleInfo,
      async () => (await this.getCoreAndBaseInfo([uid])).get(uid)
    ]
    for (const func of funcs) {
      try {
        const res = await func()
        if (res) return res
      } catch (e) {

      }
    }
    throw new Error(`获取用户信息失败, uid: ${uid}`)
  }
}
