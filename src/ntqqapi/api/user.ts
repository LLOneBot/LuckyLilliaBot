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

  /** OIDB 0xfe1_1 / 0xfe1_2 都拒绝自查（errorCode=62）。
   * 自己的昵称在登录时从 wtlogin TLV 0x11A 拿到（保存在 selfInfo.nick）。
   * 兜底从群成员列表里找自己。 */
  private async fetchSelfInfo(): Promise<{ uin: string, uid: string, nick: string } | null> {
    if (!selfInfo.uid) return null
    if (selfInfo.nick) {
      return { uin: selfInfo.uin, uid: selfInfo.uid, nick: selfInfo.nick }
    }
    try {
      const groups = await this.ctx.ntGroupApi.getGroups(false)
      for (const g of groups) {
        try {
          const members: any = await this.ctx.ntGroupApi.getGroupMembers(String(g.groupCode))
          const me = members.result?.infos?.get(selfInfo.uid)
          if (me?.nick) {
            selfInfo.nick = me.nick
            return { uin: selfInfo.uin, uid: selfInfo.uid, nick: me.nick }
          }
        } catch {}
      }
    } catch (e) {
      this.ctx.logger.error('fetchSelfInfo via groups failed', e)
    }
    return { uin: selfInfo.uin, uid: selfInfo.uid, nick: '' }
  }

  async setSelfAvatar(_path: string): Promise<{ result: number, errMsg: string }> {
    throw new Error('setSelfAvatar 暂未实现 (直连模式)')
  }

  async getUidByUin(uin: string, groupCode?: string) {
    if (uin === selfInfo.uin) return selfInfo.uid
    // 通过群成员列表查（最直接）
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
    if (uin === selfInfo.uin) {
      const self = await this.fetchSelfInfo()
      return {
        detail: {
          uid: self?.uid ?? '',
          uin: self?.uin ?? uin,
          nick: self?.nick ?? '',
          sex: 0,
          age: 0,
          longNick: '',
          level: 0,
        },
      }
    }
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
    if (uid === selfInfo.uid && selfInfo.uin) return selfInfo.uin
    const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
    return String(info.uin || '')
  }

  /** 始终会从服务器拉取 */
  async fetchUserDetailInfo(uid: string) {
    if (uid === selfInfo.uid) {
      const self = await this.fetchSelfInfo()
      return {
        simpleInfo: makeSimpleInfoFromOidb(uid, { uin: self?.uin, nick: self?.nick }),
        commonExt: null,
      }
    }
    const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
    return {
      simpleInfo: makeSimpleInfoFromOidb(uid, info),
      commonExt: null,
    }
  }

  async getUserDetailInfoWithBizInfo(uid: string) {
    const r = await this.fetchUserDetailInfo(uid)
    return r as unknown as UserDetailInfo
  }

  /** 无缓存时会从服务器拉取 */
  async getUserSimpleInfo(uid: string, _force = true) {
    if (uid === selfInfo.uid) {
      const self = await this.fetchSelfInfo()
      return makeSimpleInfoFromOidb(uid, { uin: self?.uin, nick: self?.nick })
    }
    const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
    return makeSimpleInfoFromOidb(uid, info)
  }

  /** 无缓存时会获取不到用户信息 */
  async getCoreAndBaseInfo(uids: string[]) {
    const result = new Map<string, SimpleInfo>()
    for (const uid of uids) {
      try {
        if (uid === selfInfo.uid) {
          const self = await this.fetchSelfInfo()
          result.set(uid, makeSimpleInfoFromOidb(uid, { uin: self?.uin, nick: self?.nick }))
        } else {
          const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
          result.set(uid, makeSimpleInfoFromOidb(uid, info))
        }
      } catch (e) {
        this.ctx.logger.error('getCoreAndBaseInfo failed for uid', uid, e)
      }
    }
    return result
  }

  async getBuddyNick(uid: string) {
    if (!uid) return ''
    if (uid === selfInfo.uid) {
      const self = await this.fetchSelfInfo()
      return self?.nick ?? ''
    }
    try {
      const info = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
      return info.nick
    } catch (e) {
      this.ctx.logger.error('getBuddyNick failed', e)
      return ''
    }
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
    const self = await this.fetchSelfInfo()
    return self?.nick ?? selfInfo.nick
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
