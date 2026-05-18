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

  async setSelfAvatar(_path: string): Promise<{ result: number, errMsg: string }> {
    throw new Error('setSelfAvatar 暂未实现 (直连模式)')
  }

  async getUidByUin(uin: string, groupCode?: string) {
    // 优先尝试 OIDB by uin
    try {
      const info = await this.ctx.qqProtocol.fetchUserInfo(+uin)
      // OIDB 0xfe1_2 不返回 uid，必须从其他渠道
    } catch {}
    // 通过群成员列表获取 uid
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
    try {
      const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
      if (info?.uin) return String(info.uin)
    } catch (e) {
      this.ctx.logger.error('getUinByUid failed', e)
    }
    return ''
  }

  /** 始终会从服务器拉取 */
  async fetchUserDetailInfo(uid: string) {
    const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
    return {
      simpleInfo: makeSimpleInfoFromOidb(uid, info),
      commonExt: null,
    }
  }

  async getUserDetailInfoWithBizInfo(uid: string) {
    const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
    return {
      simpleInfo: makeSimpleInfoFromOidb(uid, info),
      commonExt: null,
    } as unknown as UserDetailInfo
  }

  /** 无缓存时会从服务器拉取 */
  async getUserSimpleInfo(uid: string, _force = true) {
    const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
    return makeSimpleInfoFromOidb(uid, info)
  }

  /** 无缓存时会获取不到用户信息 */
  async getCoreAndBaseInfo(uids: string[]) {
    const result = new Map<string, SimpleInfo>()
    for (const uid of uids) {
      try {
        const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
        result.set(uid, makeSimpleInfoFromOidb(uid, info))
      } catch (e) {
        this.ctx.logger.error('getCoreAndBaseInfo failed for uid', uid, e)
      }
    }
    return result
  }

  async getBuddyNick(uid: string) {
    const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
    return info.nick
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
    if ((refresh || !selfInfo.nick) && selfInfo.uid) {
      try {
        let nick = await this.getBuddyNick(selfInfo.uid)
        if (!nick) {
          nick = (await this.getUserSimpleInfo(selfInfo.uid, refresh)).coreInfo.nick
        }
        selfInfo.nick = nick
      } catch (e) {
        this.ctx.logger.error('getSelfNick failed', e)
      }
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
