import { MiniProfile, ProfileBizType, SimpleInfo, UserDetailInfoV2, UserDetailSource } from '../types'
import { invoke } from '../ntcall'
import { RequestUtil } from '@/common/utils/request'
import { Time } from 'cosmokit'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { uidUinMap } from '@/ntqqapi/cache'

declare module 'cordis' {
  interface Context {
    ntUserApi: NTQQUserApi
  }
}

export class NTQQUserApi extends Service {
  static inject = ['ntFriendApi', 'ntGroupApi']

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

  async fetchUserDetailInfo(uid: string) {
    const result = await invoke<{ info: UserDetailInfoV2 }>(
      'nodeIKernelProfileService/fetchUserDetailInfo',
      [{
        callFrom: 'BuddyProfileStore',
        uid: [uid],
        source: UserDetailSource.KSERVER,
        bizList: [ProfileBizType.KALL],
      }],
      {
        resultCmd: 'nodeIKernelProfileListener/onUserDetailInfoChanged',
        resultCb: payload => payload.info.uid === uid,
      },
    )
    return result.info
  }

  async getUserDetailInfo(uid: string) {
    const result = await invoke<{ simpleInfo: SimpleInfo }>(
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
    return result.simpleInfo
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

  async getUidByUin(uin: string, groupCode?: string) {
    let callResult: any = (await invoke('nodeIKernelGroupService/getUidByUins', [[uin]]))
    let uid = callResult.uids.get(uin)
    if (uid) return uid
    callResult = (await invoke('nodeIKernelProfileService/getUidByUin', ['FriendsServiceImpl', [uin]]))
    uid = callResult?.get(uin)
    if (uid) return uid
    callResult = (await invoke('nodeIKernelUixConvertService/getUid', [[uin]]))
    uid = callResult?.uidInfo.get(uin)
    if (uid) return uid
    callResult = (await this.getUserDetailInfoByUin(uin))
    uid = callResult.detail!.uid
    //if (!unveifyUid.includes('*')) return unveifyUid
    return uid
  }

  async getUserDetailInfoByUin(uin: string) {
    return await invoke('nodeIKernelProfileService/getUserDetailInfoByUin', [uin])
  }

  async getUinByUid(uid: string, groupCode?: string): Promise<string> {
    // let uin = (await invoke('nodeIKernelGroupService/getUinByUids', [{ uidList: [uid] }])).uins.get(uid)
    // if (uin && uin !== '0') return uin
    // uin = (await invoke('nodeIKernelProfileService/getUinByUid', [{ callFrom: 'FriendsServiceImpl', uid: [uid] }])).get(uid)
    // if (uin) return uin
    let uin = uidUinMap.get(uid)
    if (uin) return uin
    if (groupCode){
      try {
        await this.ctx.ntGroupApi.getGroupMembers(groupCode)
        uin = uidUinMap.get(uid)
      }catch (e) {

      }
    }
    if (uin) return uin
    try {
      uin = (await invoke('nodeIKernelUixConvertService/getUin', [[uid]])).uinInfo.get(uid) || ''
      if (uin) uidUinMap.set(uid, uin)
      return uin
    } catch (e) {
      // this.ctx.logger.error('nodeIKernelUixConvertService/getUin error', e)
    }
    try{
      uin = (await this.getUserDetailInfo(uid)).uin
      return uin!
    }
    catch (e) {
      this.ctx.logger.error('getUserDetailInfo from getUinByUid error', e)
    }
    return ''
  }

  async forceFetchClientKey() {
    return await invoke('nodeIKernelTicketService/forceFetchClientKey', [{ url: '' }])
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

  async getUserSimpleInfoV2(uid: string, force = true) {
    return (await this.getUserDetailInfo(uid))
    // const data = await invoke<Map<string, SimpleInfo>>(
    //   'nodeIKernelProfileService/getUserSimpleInfo',
    //   [
    //     [uid],
    //     force
    //   ],
    //   {
    //     resultCmd: ReceiveCmdS.USER_INFO,
    //   }
    // )
    // return data.get(uid)?.coreInfo
  }

  async getUserSimpleInfo(uid: string, force = true) {
    return this.getUserSimpleInfoV2(uid, force)
  }

  async getCoreAndBaseInfo(uids: string[]) {
    return await invoke(
      'nodeIKernelProfileService/getCoreAndBaseInfo',
      [
        uids,
        'nodeStore',
      ],
    )
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
}
