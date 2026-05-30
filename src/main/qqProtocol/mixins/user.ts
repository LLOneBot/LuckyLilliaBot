import { Action, Oidb } from '@/ntqqapi/proto'
import type { QQProtocolBase } from '../base'
import { Dict, isNonNullable } from 'cosmokit'
import { selfInfo } from '@/common/globalVars'

export function UserMixin<T extends new (...args: any[]) => QQProtocolBase>(Base: T) {
  return class extends Base {
    async fetchUserInfoByUin(uin: number) {
      const body = Oidb.FetchUserInfoByUinReq.encode({
        uin,
        keys: [
          { key: 102 },  // 个性签名
          { key: 103 },  // 备注
          { key: 104 },  // 标签
          { key: 105 },  // 等级
          { key: 107 },  // 业务列表
          { key: 20002 },  // 昵称
          { key: 20003 },  // 国家
          { key: 20009 },  // 性别
          { key: 20020 },  // 城市
          { key: 20021 },  // 学校
          { key: 20026 },  // 注册时间
          { key: 20031 },  // 生日
          { key: 20037 },  // 年龄
          { key: 27394 },  // QID
        ],
      })
      // by-UIN 需要 isReserved=1
      const data = Oidb.Base.encode({
        command: 0xfe1,
        subCommand: 2,
        body,
        isReserved: 1,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0xfe1_2', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      return Oidb.FetchUserInfoResp.decode(decoded.body)
    }

    async fetchUserInfoByUid(uid: string) {
      const body = Oidb.FetchUserInfoByUidReq.encode({
        uid,
        keys: [
          { key: 102 },  // 个性签名
          { key: 103 },  // 备注
          { key: 104 },  // 标签
          { key: 105 },  // 等级
          { key: 107 },  // 业务列表
          { key: 20002 },  // 昵称
          { key: 20003 },  // 国家
          { key: 20009 },  // 性别
          { key: 20020 },  // 城市
          { key: 20021 },  // 学校
          { key: 20026 },  // 注册时间
          { key: 20031 },  // 生日
          { key: 20037 },  // 年龄
          { key: 27394 },  // QID
        ],
      })
      // 注意：by-UID 不能加 isReserved=1（FetchStrangerService 路径）
      const data = Oidb.Base.encode({
        command: 0xfe1,
        subCommand: 2,
        body,
      })
      const res = await this.sendPB('OidbSvcTrpcTcp.0xfe1_2', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      return Oidb.FetchUserInfoResp.decode(decoded.body)
    }

    async fetchUserLoginDays(uin: number): Promise<number> {
      const body = Action.FetchUserLoginDaysReq.encode({
        field2: 0,
        json: JSON.stringify({
          msg_req_basic_info: { uint64_request_uin: [uin] },
          uint32_req_login_info: 1,
        }),
      })
      const res = await this.sendPB('MQUpdateSvc_com_qq_ti.web.OidbSvc.0xdef_1', body)
      const { json } = Action.FetchUserLoginDaysResp.decode(Buffer.from(res.pb, 'hex'))
      return (
        JSON.parse(json).msg_rsp_basic_info?.rpt_msg_basic_info.find((e: Dict) => e.uint64_uin === uin)
          ?.uint32_login_days ?? 0
      )
    }

    /** 给好友点赞，count 1~20 表示一次点赞次数（QQ 协议限制每天 20 个） */
    async sendFriendLike(targetUid: string, count: number = 1) {
      const body = Oidb.FriendLikeReq.encode({ targetUid, field2: 71, count })
      return await this.sendOidb(0x7e5, 104, body)
    }

    /** 设置在线状态。status: 在线状态码（10=在线, 30=离开, 40=隐身, 50=忙碌, 60=Q我, 70=请勿打扰）；extStatus 通常 0 */
    async setOnlineStatus(status: number, extStatus: number, batteryStatus: number, customFaceId?: number, customText?: string) {
      const body = Action.SetStatusReq.encode({
        status,
        extStatus,
        batteryStatus,
        customExt: customFaceId ? { faceId: customFaceId, text: customText ?? '', field3: 1 } : undefined,
      })
      const res = await this.sendPB('trpc.qq_new_tech.status_svc.StatusService.SetStatus', body)
      return Action.SetStatusResp.decode(Buffer.from(res.pb, 'hex'))
    }

    /** 拉 clientKey（用于换 web cookies）。OidbSvcTrpcTcp.0x102a_1 */
    async fetchClientKey() {
      const body = Oidb.FetchCookiesReq.encode({})
      const data = Oidb.Base.encode({ command: 0x102a, subCommand: 1, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x102a_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      return Oidb.FetchCookiesResp.decode(decoded.body)
    }

    /** 拉指定 domain 的 PSkey 字典。OidbSvcTrpcTcp.0x102a_0 */
    async fetchPSkey(domains: string[]) {
      const body = Oidb.FetchCookiesReq.encode({ domain: domains })
      const data = Oidb.Base.encode({ command: 0x102a, subCommand: 0, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x102a_0', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      return Oidb.FetchCookiesResp.decode(decoded.body)
    }

    /** 获取赞过我或我赞过的列表。direction: 0=我赞过的, 1=赞过我的。OidbSvcTrpcTcp.0x7ed_13 */
    async fetchProfileLikes(targetUid: string, direction: 0 | 1, count: number) {
      const body = Oidb.FetchProfileLikeReq.encode({
        targetUid,
        field2: 1,
        direction,
        field4: direction === 0 ? 1 : 0,
        field101: 1,
        field102: 0,
        count,
      })
      const data = Oidb.Base.encode({ command: 0x7ed, subCommand: 13, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x7ed_13', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      return Oidb.FetchProfileLikeResp.decode(decoded.body)
    }

    /** 修改自己的资料 (OidbSvcTrpcTcp.0x112a_2) */
    async modifySelfProfile(profile: { nick?: string, longNick?: string, sex?: number, birthdayYear?: number, birthdayMonth?: number, birthdayDay?: number }) {
      const bytesProperties: { key: number, value: Buffer }[] = []
      const numberProperties: { key: number, value: number }[] = []
      if (isNonNullable(profile.longNick)) bytesProperties.push({ key: 102, value: Buffer.from(profile.longNick, 'utf-8') })
      if (isNonNullable(profile.nick)) bytesProperties.push({ key: 20002, value: Buffer.from(profile.nick, 'utf-8') })
      // 20032 是 location，复杂结构，目前只用 12 字节零（清空）
      bytesProperties.push({ key: 20032, value: Buffer.alloc(12) })
      if (isNonNullable(profile.sex)) numberProperties.push({ key: 20009, value: profile.sex })
      if (isNonNullable(profile.birthdayYear)) {
        const packed = ((profile.birthdayYear & 0xffff) << 16) | (((profile.birthdayMonth ?? 0) & 0xff) << 8) | ((profile.birthdayDay ?? 0) & 0xff)
        numberProperties.push({ key: 20031, value: packed })
      }
      const body = Oidb.ModifySelfProfileReq.encode({
        selfUin: +selfInfo.uin,
        bytesProperties,
        numberProperties,
      })
      return await this.sendOidb(0x112a, 2, body)
    }
  }
}
