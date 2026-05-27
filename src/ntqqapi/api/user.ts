import { MiniProfile, ProfileBizType, SimpleInfo, UserDetailInfo, UserDetailSource, Sex } from '../types'
import { HttpUtil } from '@/common/utils/request'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { createReadStream, promises as fsp } from 'node:fs'
import { getMd5BufferFromFile } from '@/common/utils/file'
import { HighwayHttpSession } from '../helper/highway'

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
  static inject = ['ntGroupApi', 'qqProtocol', 'store', 'ntFriendApi']

  constructor(protected ctx: Context) {
    super(ctx, 'ntUserApi')
  }

  async setSelfAvatar(filePath: string): Promise<{ result: number, errMsg: string }> {
    const stat = await fsp.stat(filePath)
    const md5 = await getMd5BufferFromFile(filePath)
    const session = await this.ctx.qqProtocol.getHighwaySession()
    // service type 1 = 通用图片上传（端口 15000），与抓包一致
    const server = session.highwayHostAndPorts[1]?.[0]
    if (!server) return { result: -1, errMsg: 'no highway server (type=1)' }
    const trans = {
      uin: selfInfo.uin,
      cmd: 90, // 自身头像 commandId（PMHQ 抓包 PicUp.DataUp + htcmd=0x6FF0087 验过）
      readable: createReadStream(filePath, { highWaterMark: 1024 * 1024 }),
      sum: md5,
      size: stat.size,
      ticket: session.sigSession,
      ext: Buffer.alloc(0),
      server: server.host,
      port: server.port,
    }
    try {
      await new HighwayHttpSession(trans).upload()
      return { result: 0, errMsg: '' }
    } catch (e) {
      return { result: -1, errMsg: (e as Error).message }
    }
  }

  async getUidByUin(uin: number, groupCode?: number) {
    if (uin === +selfInfo.uin && selfInfo.uid) return selfInfo.uid
    try {
      const uid = await this.ctx.store.getUidByUin(uin)
      if (uid) return uid
    } catch (e) {
      this.ctx.logger.error('getUidByUin via store failed', e)
    }
    // 通过群成员列表查（最直接）
    if (groupCode) {
      try {
        const member = await this.ctx.ntGroupApi.getGroupMemberByUin(+groupCode, uin, true)
        if (member?.uid) return member.uid
      } catch (e) {
        this.ctx.logger.error('getUidByUin via group members failed', e)
      }
    }
    // 私聊场景没 groupCode：先从好友列表里找
    try {
      const friend = await this.ctx.ntFriendApi.getFriendByUin(uin, true)
      if (friend?.uid) return friend.uid
    } catch (e) {
      this.ctx.logger.error('getUidByUin via friends failed', e)
    }
    // 临时会话：拉一次群列表，逐个拉成员；找到一个就返
    try {
      const groups = await this.ctx.ntGroupApi.getGroups(false)
      for (const g of groups) {
        try {
          const member = await this.ctx.ntGroupApi.getGroupMemberByUin(g.groupCode, uin, true)
          if (member?.uid) return member.uid
        } catch { }
      }
    } catch (e) {
      this.ctx.logger.error('getUidByUin via group scan failed', e)
    }
    return ''
  }

  async getUinByUid(uid: string) {
    if (uid === selfInfo.uid && selfInfo.uin) return +selfInfo.uin
    try {
      const uin = await this.ctx.store.getUinByUid(uid)
      if (uin) return uin
    } catch (e) {
      this.ctx.logger.error('getUinByUid via store failed', e)
    }
    try {
      // TODO: 迁移至 getUserByUid
      const user = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
      this.ctx.store.addUix([{
        uid: user.uid,
        uin: user.uin
      }]).catch(e => this.ctx.logger.warn(e))
      return user.uin
    } catch (e) {
      this.ctx.logger.error('getUinByUid via user failed', e)
    }
    return 0
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

  /** 始终会从服务器拉取 */
  async fetchUserDetailInfo(uid: string) {
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
    if (!uid) return ''
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

  async getPSkey(domains: string[]): Promise<{ domainPskeyMap: Map<string, string> }> {
    const psKeys = await this.ctx.qqProtocol.fetchPSkey(domains)
    return { domainPskeyMap: new Map(Object.entries(psKeys)) }
  }

  async like(uid: string, count = 1): Promise<any> {
    return await this.ctx.qqProtocol.sendFriendLike(uid, count)
  }

  async forceFetchClientKey(): Promise<{ result: number, errMsg: string, clientKey: string, expireTime: string, keyIndex: string }> {
    const { clientKey, expiration } = await this.ctx.qqProtocol.fetchClientKey()
    return {
      result: 0,
      errMsg: '',
      clientKey,
      expireTime: String(expiration),
      keyIndex: '19',
    }
  }

  async getSelfNick(refresh = true) {
    if (!refresh && selfInfo.nick) return selfInfo.nick
    const self = await this.getUserSimpleInfo(selfInfo.uid)
    const nick = self.coreInfo.nick
    selfInfo.nick = nick
    return nick
  }

  async setSelfStatus(status: number, extStatus: number, _batteryStatus: number): Promise<any> {
    // 直连协议没有独立的电池上报通道，batteryStatus 忽略
    const r = await this.ctx.qqProtocol.setOnlineStatus(status, extStatus)
    return { result: 0, errMsg: r?.message || '' }
  }

  async getProfileLike(uid: string, _start = 0, limit = 20): Promise<any> {
    const r = await this.ctx.qqProtocol.fetchProfileLikes(uid, 0, limit)
    return {
      result: 0,
      errMsg: '',
      info: {
        start: r.nextStart,
        userLikeInfos: [{ favoriteInfo: { userInfos: r.users } }],
      },
    }
  }

  async getProfileLikeMe(uid: string, _start = 0, limit = 20): Promise<any> {
    const r = await this.ctx.qqProtocol.fetchProfileLikes(uid, 1, limit)
    return {
      result: 0,
      errMsg: '',
      info: {
        start: r.nextStart,
        userLikeInfos: [{ voteInfo: { userInfos: r.users } }],
      },
    }
  }

  async getRobotUinRange(): Promise<any> {
    return { result: 0, errMsg: '', response: { robotUinRanges: [] } }
  }

  async quitAccount(): Promise<any> {
    // 直连协议没有 server 端"主动登出"接口；本地断开 TCP + 清除 session 即可
    const client = this.ctx.qqProtocol.directClient
    if (client?.isConnected) {
      client.disconnect()
    }
    return { result: 0, errMsg: '' }
  }

  async modifySelfProfile(profile: MiniProfile): Promise<{ result: number, errMsg: string }> {
    await this.ctx.qqProtocol.modifySelfProfile({
      nick: profile.nick,
      longNick: profile.longNick,
      sex: profile.sex,
      birthdayYear: profile.birthday?.birthday_year,
      birthdayMonth: profile.birthday?.birthday_month,
      birthdayDay: profile.birthday?.birthday_day,
    })
    return { result: 0, errMsg: '' }
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
