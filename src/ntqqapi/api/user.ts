import { User } from '../types'
import { Context, Service } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { createReadStream, promises as fsp } from 'node:fs'
import { getMd5BufferFromFile } from '@/common/utils/file'
import { HighwayHttpSession } from '../helper/highway'
import { Misc } from '../proto'

declare module 'cordis' {
  interface Context {
    ntUserApi: NTQQUserApi
  }
}

export class NTQQUserApi extends Service {
  static inject = ['ntGroupApi', 'qqProtocol', 'store', 'ntFriendApi']

  constructor(protected ctx: Context) {
    super(ctx, 'ntUserApi')
  }

  async setSelfAvatar(filePath: string) {
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
        if (member) {
          this.ctx.store.addUix([{
            uid: member.uid,
            uin: member.uin
          }]).catch(e => this.ctx.logger.warn(e))
          return member.uid
        }
      } catch (e) {
        this.ctx.logger.error('getUidByUin via group members failed', e)
      }
    }
    // 私聊场景没 groupCode：先从好友列表里找
    try {
      const friend = await this.ctx.ntFriendApi.getFriendByUin(uin, true)
      if (friend) {
        this.ctx.store.addUix([{
          uid: friend.uid,
          uin: friend.uin
        }]).catch(e => this.ctx.logger.warn(e))
        return friend.uid
      }
    } catch (e) {
      this.ctx.logger.error('getUidByUin via friends failed', e)
    }
    // 临时会话：拉一次群列表，逐个拉成员；找到一个就返
    try {
      const groups = await this.ctx.ntGroupApi.getGroups(false)
      for (const g of groups) {
        try {
          const member = await this.ctx.ntGroupApi.getGroupMemberByUin(g.groupCode, uin, true)
          if (member) {
            this.ctx.store.addUix([{
              uid: member.uid,
              uin: member.uin
            }]).catch(e => this.ctx.logger.warn(e))
            return member.uid
          }
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
      const user = await this.getUserByUid(uid)
      // 输入错误的 uid 时，返回的 uin 为 0
      if (user.uin) {
        this.ctx.store.addUix([{
          uid,
          uin: user.uin
        }]).catch(e => this.ctx.logger.warn(e))
        return user.uin
      }
    } catch (e) {
      this.ctx.logger.error('getUinByUid via user failed', e)
    }
    return 0
  }

  async getUserByUin(uin: number) {
    const resp = await this.ctx.qqProtocol.fetchUserInfoByUin(uin)
    const numbers = resp.body.properties.numberProperties
    const bytes = resp.body.properties.bytesProperties
    const business = bytes.has(107) ? Misc.UserInfoBusiness.decode(bytes.get(107)!) : undefined
    const vipInfo = business?.body.lists.find((e) => e.type === 1)
    const info: User = {
      uin: resp.body.uin,
      nick: bytes.get(20002)?.toString() ?? '',
      gender: numbers.get(20009) ?? 0,
      age: numbers.get(20037) ?? 0,
      qid: bytes.get(27394)?.toString() ?? '',
      level: numbers.get(105) ?? 0,
      registerTime: numbers.get(20026) ?? 0,
      bio: bytes.get(102)?.toString() ?? '',
      city: bytes.get(20020)?.toString() ?? '',
      country: bytes.get(20003)?.toString() ?? '',
      birthdayYear: bytes.has(20031) ? (bytes.get(20031)![0] << 8) | bytes.get(20031)![1] : 0,
      birthdayMonth: bytes.get(20031)?.[2] ?? 0,
      birthdayDay: bytes.get(20031)?.[3] ?? 0,
      labels: bytes.has(104) ? Misc.UserInfoLabel.decode(bytes.get(104)!).labels.map(e => e.content) : [],
      school: bytes.get(20021)?.toString() ?? '',
      remark: bytes.get(103)?.toString() ?? '',
      isVip: !!vipInfo,
      isYearsVip: !!vipInfo?.isYear,
      vipLevel: vipInfo?.level ?? 0
    }
    return info
  }

  async getUserByUid(uid: string) {
    const resp = await this.ctx.qqProtocol.fetchUserInfoByUid(uid)
    const numbers = resp.body.properties.numberProperties
    const bytes = resp.body.properties.bytesProperties
    const business = bytes.has(107) ? Misc.UserInfoBusiness.decode(bytes.get(107)!) : undefined
    const vipInfo = business?.body.lists.find((e) => e.type === 1)
    const info: User = {
      uin: resp.body.uin,
      nick: bytes.get(20002)?.toString() ?? '',
      gender: numbers.get(20009) ?? 0,
      age: numbers.get(20037) ?? 0,
      qid: bytes.get(27394)?.toString() ?? '',
      level: numbers.get(105) ?? 0,
      registerTime: numbers.get(20026) ?? 0,
      bio: bytes.get(102)?.toString() ?? '',
      city: bytes.get(20020)?.toString() ?? '',
      country: bytes.get(20003)?.toString() ?? '',
      birthdayYear: bytes.has(20031) ? (bytes.get(20031)![0] << 8) | bytes.get(20031)![1] : 0,
      birthdayMonth: bytes.get(20031)?.[2] ?? 0,
      birthdayDay: bytes.get(20031)?.[3] ?? 0,
      labels: bytes.has(104) ? Misc.UserInfoLabel.decode(bytes.get(104)!).labels.map(e => e.content) : [],
      school: bytes.get(20021)?.toString() ?? '',
      remark: bytes.get(103)?.toString() ?? '',
      isVip: !!vipInfo,
      isYearsVip: !!vipInfo?.isYear,
      vipLevel: vipInfo?.level ?? 0
    }
    return info
  }

  async getPSkey(domains: string[]) {
    const { psKeys } = await this.ctx.qqProtocol.fetchPSkey(domains)
    return psKeys
  }

  async getClientKey() {
    const { clientKey, expiration } = await this.ctx.qqProtocol.fetchClientKey()
    return {
      clientKey,
      expiration
    }
  }

  async getSelfNick(refresh = true) {
    if (!refresh && selfInfo.nick) return selfInfo.nick
    const self = await this.getUserByUid(selfInfo.uid)
    const nick = self.nick
    selfInfo.nick = nick
    return nick
  }

  async setSelfStatus(status: number, extStatus: number, batteryStatus: number) {
    return await this.ctx.qqProtocol.setOnlineStatus(status, extStatus, batteryStatus)
  }

  async sendProfileLike(uid: string, count = 1) {
    return await this.ctx.qqProtocol.sendFriendLike(uid, count)
  }

  async getProfileLike(uid: string, limit = 20) {
    return await this.ctx.qqProtocol.fetchProfileLikes(uid, 0, limit)
  }

  async getProfileLikeMe(uid: string, limit = 20) {
    return await this.ctx.qqProtocol.fetchProfileLikes(uid, 1, limit)
  }

  async modifySelfProfile(profile: {
    nick?: string
    bio?: string
    gender?: number
    birthdayYear?: number
    birthdayMonth?: number
    birthdayDay?: number
  }) {
    return await this.ctx.qqProtocol.modifySelfProfile({
      nick: profile.nick,
      longNick: profile.bio,
      sex: profile.gender,
      birthdayYear: profile.birthdayYear,
      birthdayMonth: profile.birthdayMonth,
      birthdayDay: profile.birthdayDay,
    })
  }
}
