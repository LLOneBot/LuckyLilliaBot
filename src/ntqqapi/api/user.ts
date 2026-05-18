import { MiniProfile, ProfileBizType, SimpleInfo, UserDetailInfo, UserDetailSource, Sex } from '../types'
import { HttpUtil } from '@/common/utils/request'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'

declare module 'cordis' {
  interface Context {
    ntUserApi: NTQQUserApi
  }
}

function makeSimpleInfoFromOidb(uid: string, info: any): SimpleInfo {
  return {
    uid,
    uin: String(info.uin || 0),
    coreInfo: {
      uid,
      uin: String(info.uin || 0),
      nick: info.nick || '',
      remark: info.remark || '',
    },
    baseInfo: {
      qid: info.qid || '',
      longNick: info.longNick || '',
      birthday_year: 0,
      birthday_month: 0,
      birthday_day: 0,
      age: info.age || 0,
      sex: (info.sex || 0) as Sex,
      eMail: '',
      phoneNum: '',
      categoryId: 0,
    } as any,
    status: null,
    vasInfo: null,
    relationFlags: null,
    otherFlags: null,
    intimate: null,
  }
}

export class NTQQUserApi extends Service {
  static inject = ['ntGroupApi', 'logger', 'qqProtocol']

  constructor(protected ctx: Context) {
    super(ctx, 'ntUserApi')
  }

  /** 安全获取 ntFriendApi（避免 cordis 循环依赖：user→friend，friend 缓存里有 uin/nick） */
  private get friendApi(): any {
    return this.ctx.get('ntFriendApi')
  }

  async setSelfAvatar(_path: string): Promise<{ result: number, errMsg: string }> {
    throw new Error('setSelfAvatar 暂未实现 (直连模式)')
  }

  async getUidByUin(uin: string, groupCode?: string) {
    // 1) 好友列表
    try {
      const friend = await this.friendApi?.getFriendByUin(+uin, false)
      if (friend?.uid) return friend.uid
    } catch {}
    // 2) 群成员列表
    if (groupCode) {
      try {
        const groupMembers: any = await this.ctx.ntGroupApi.getGroupMembers(groupCode)
        const found = [...groupMembers.result?.infos?.values() ?? []].find((e: any) => String(e.uin) === String(uin))
        if (found?.uid) return found.uid
      } catch (e) {
        this.ctx.logger.error('getUidByUin via group members failed', e)
      }
    }
    return ''
  }

  async getUserDetailInfoByUin(uin: string) {
    const info = await this.ctx.qqProtocol.fetchUserInfo(+uin)
    return {
      detail: {
        uid: '',
        uin: String(info.uin),
        nick: info.nick,
        sex: info.sex,
        age: info.age,
        longNick: info.longNick,
        level: info.level,
      },
    }
  }

  async getUinByUid(uid: string): Promise<string> {
    if (!uid) return ''
    // 自己
    if (uid === selfInfo.uid && selfInfo.uin) return selfInfo.uin
    // 1) 好友列表（最准）
    try {
      const friend = await this.friendApi?.getFriendByUid(uid, false)
      if (friend?.uin && +friend.uin > 10000) return String(friend.uin)
    } catch {}
    // 2) OIDB 0xfe1_2 (协议返回的 body.uin 是占位符，仅在没有更好信息时使用)
    try {
      const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
      const uin = String(info.uin || '')
      if (uin && +uin > 10000) return uin
    } catch (e) {
      this.ctx.logger.error('getUinByUid via OIDB 0xfe1_2 failed', e)
    }
    return ''
  }

  /** 始终会从服务器拉取 */
  async fetchUserDetailInfo(uid: string) {
    const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
    const enriched = await this.enrichWithFriendCache(uid, info)
    return {
      simpleInfo: makeSimpleInfoFromOidb(uid, enriched),
      commonExt: null,
    }
  }

  async getUserDetailInfoWithBizInfo(uid: string) {
    const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
    const enriched = await this.enrichWithFriendCache(uid, info)
    return {
      simpleInfo: makeSimpleInfoFromOidb(uid, enriched),
      commonExt: null,
    } as unknown as UserDetailInfo
  }

  /** 无缓存时会从服务器拉取 */
  async getUserSimpleInfo(uid: string, _force = true) {
    const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
    const enriched = await this.enrichWithFriendCache(uid, info)
    return makeSimpleInfoFromOidb(uid, enriched)
  }

  /** 无缓存时会获取不到用户信息 */
  async getCoreAndBaseInfo(uids: string[]) {
    const result = new Map<string, SimpleInfo>()
    for (const uid of uids) {
      try {
        const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
        const enriched = await this.enrichWithFriendCache(uid, info)
        result.set(uid, makeSimpleInfoFromOidb(uid, enriched))
      } catch (e) {
        this.ctx.logger.error('getCoreAndBaseInfo failed for uid', uid, e)
      }
    }
    return result
  }

  async getBuddyNick(uid: string) {
    if (!uid) return ''
    // 1) 自己
    if (uid === selfInfo.uid && selfInfo.nick) return selfInfo.nick
    // 2) 好友列表
    try {
      const friend = await this.friendApi?.getFriendByUid(uid, false)
      if (friend?.nick) return friend.nick
    } catch {}
    // 3) OIDB（实际上 0xfe1_2 返回空 nick，但保留作为最后兜底）
    try {
      const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
      if (info.nick) return info.nick
    } catch {}
    return ''
  }

  /** 用好友列表里的 uin / nick 补全 OIDB 0xfe1_2 缺失的字段 */
  private async enrichWithFriendCache(uid: string, info: any): Promise<any> {
    const needsUin = !info?.uin || +info.uin <= 10000
    const needsNick = !info?.nick
    if (!needsUin && !needsNick) return info
    if (uid === selfInfo.uid) {
      return {
        ...info,
        uin: needsUin ? selfInfo.uin : info.uin,
        nick: needsNick ? (selfInfo.nick || info.nick || '') : info.nick,
      }
    }
    try {
      const friend = await this.friendApi?.getFriendByUid(uid, false)
      if (friend) {
        return {
          ...info,
          uin: needsUin && friend.uin ? friend.uin : info.uin,
          nick: needsNick && friend.nick ? friend.nick : info.nick,
        }
      }
    } catch {}
    return info
  }

  async getCookies(domain: string) {
    const clientKeyData = await this.forceFetchClientKey()
    if (clientKeyData?.result !== 0) {
      throw new Error('获取clientKey失败')
    }
    const uin = selfInfo.uin
    const requestUrl = 'https://ssl.ptlogin2.qq.com/jump?ptlang=1033&clientuin=' + uin + '&clientkey=' + clientKeyData.clientKey + '&u1=https%3A%2F%2F' + domain + '%2F' + uin + '%2Finfocenter&keyindex=19%27'
    const cookies: { [key: string]: string } = await HttpUtil.getCookies(requestUrl)
    return cookies
  }

  async getPSkey(_domains: string[]): Promise<any> {
    throw new Error('getPSkey 暂未实现 (直连模式)')
  }

  async like(_uid: string, _count = 1): Promise<any> {
    throw new Error('like 暂未实现 (直连模式)')
  }

  async forceFetchClientKey(): Promise<any> {
    throw new Error('forceFetchClientKey 暂未实现 (直连模式)')
  }

  async getSelfNick(refresh = true) {
    if (!refresh && selfInfo.nick) return selfInfo.nick
    if (!selfInfo.uid) return selfInfo.nick
    // 自己不在好友列表，OIDB 0xfe1 by self uid/uin 都不返回 nick
    // 通过群成员列表里的自己拿
    try {
      const groups = await this.ctx.ntGroupApi.getGroups(false)
      for (const g of groups) {
        try {
          const members: any = await this.ctx.ntGroupApi.getGroupMembers(String(g.groupCode))
          const me = members.result?.infos?.get(selfInfo.uid)
          if (me?.nick) {
            selfInfo.nick = me.nick
            return me.nick
          }
        } catch {}
        if (selfInfo.nick) return selfInfo.nick
      }
    } catch (e) {
      this.ctx.logger.error('getSelfNick via groups failed', e)
    }
    return selfInfo.nick
  }

  async setSelfStatus(_status: number, _extStatus: number, _batteryStatus: number): Promise<any> {
    throw new Error('setSelfStatus 暂未实现 (直连模式)')
  }

  async getProfileLike(_uid: string, _start = 0, _limit = 20): Promise<any> {
    throw new Error('getProfileLike 暂未实现 (直连模式)')
  }

  async getProfileLikeMe(_uid: string, _start = 0, _limit = 20): Promise<any> {
    throw new Error('getProfileLikeMe 暂未实现 (直连模式)')
  }

  async getRobotUinRange(): Promise<any> {
    return { response: { robotUinRanges: [] } }
  }

  async quitAccount(): Promise<any> {
    throw new Error('quitAccount 暂未实现 (直连模式)')
  }

  async modifySelfProfile(_profile: MiniProfile): Promise<any> {
    throw new Error('modifySelfProfile 暂未实现 (直连模式)')
  }

  async getRecentContactListSnapShot(_count: number): Promise<any> {
    return { contacts: [] }
  }

  async getUserInfoCompatible(uid: string) {
    try {
      const res = await this.getUserSimpleInfo(uid, true)
      if (res) return res
    } catch (e) {
      this.ctx.logger.error('getUserInfoCompatible failed', e)
    }
    throw new Error(`获取用户信息失败, uid: ${uid}`)
  }
}
