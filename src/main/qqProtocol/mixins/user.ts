import { Action, Misc, Oidb } from '@/ntqqapi/proto'
import type { QQProtocolBase } from '../base'
import { Dict } from 'cosmokit'

export function UserMixin<T extends new (...args: any[]) => QQProtocolBase>(Base: T) {
  return class extends Base {
    async fetchUserInfo(uin: number) {
      const body = Oidb.FetchUserInfoReq.encode({
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
      if (decoded.errorCode !== 0) {
        throw new Error(`fetchUserInfo(uin=${uin}) failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const info = Oidb.FetchUserInfoResp.decode(Buffer.from(decoded.body))
      const numbers = Object.fromEntries(info.body.properties.numberProperties.map(p => [p.key, p.value]))
      const bytes = Object.fromEntries(info.body.properties.bytesProperties.map(p => [p.key, p.value]))
      const business = bytes[107] ? Misc.UserInfoBusiness.decode(bytes[107]) : undefined
      const vipInfo = business?.body.lists.find((e) => e.type === 1)
      return {
        uin: info.body.uin,
        nick: bytes[20002]?.toString() ?? '',
        sex: numbers[20009] ?? 0,
        age: numbers[20037] ?? 0,
        qid: bytes[27394]?.toString() ?? '',
        level: numbers[105],
        regTime: numbers[20026] ?? 0,
        longNick: bytes[102]?.toString() ?? '',
        city: bytes[20020]?.toString() ?? '',
        country: bytes[20003]?.toString() ?? '',
        birthdayYear: (bytes[20031]?.[0] << 8) | bytes[20031]?.[1],
        birthdayMonth: bytes[20031]?.[2] ?? 0,
        birthdayDay: bytes[20031]?.[3] ?? 0,
        labels: bytes[104] ? Misc.UserInfoLabel.decode(bytes[104]).labels.map(e => e.content) : [],
        school: bytes[20021]?.toString() ?? '',
        remark: bytes[103]?.toString() ?? '',
        isVip: !!vipInfo,
        isYearsVip: !!vipInfo?.isYear,
        vipLevel: vipInfo?.level ?? 0
      }
    }

    async fetchUserInfoByUid(uid: string) {
      const body = Oidb.FetchUserInfoByUidReq.encode({
        uid,
        keys: [
          { key: 102 },
          { key: 103 },
          { key: 104 },
          { key: 105 },
          { key: 107 },
          { key: 20002 },
          { key: 20009 },
          { key: 20037 },
          { key: 27394 },
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
      if (decoded.errorCode !== 0) {
        throw new Error(`fetchUserInfoByUid(uid=${uid}) failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const info = Oidb.FetchUserInfoResp.decode(Buffer.from(decoded.body))
      const numbers = Object.fromEntries(info.body.properties.numberProperties.map(p => [p.key, p.value]))
      const bytes = Object.fromEntries(info.body.properties.bytesProperties.map(p => [p.key, p.value]))
      return {
        uid,
        uin: info.body.uin,
        nick: bytes[20002]?.toString() ?? '',
        sex: numbers[20009] ?? 0,
        age: numbers[20037] ?? 0,
        qid: bytes[27394]?.toString() ?? '',
        level: numbers[105] ?? 0,
        longNick: bytes[102]?.toString() ?? '',
        remark: bytes[103]?.toString() ?? '',
      }
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
      const data = Oidb.Base.encode({ command: 0x7e5, subCommand: 104, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x7e5_104', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`sendFriendLike failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      return { result: 0 }
    }

    /** 设置在线状态。status: 在线状态码（11=在线, 31=离开, 41=隐身, 50=忙碌, 60=Q我, 70=请勿打扰）；extStatus 通常 0 */
    async setOnlineStatus(status: number, extStatus: number = 0, customFaceId?: number, customText?: string) {
      const body = Action.SetStatusReq.encode({
        field1: 10,
        status,
        extStatus,
        customExt: customFaceId != null ? { faceId: customFaceId, text: customText ?? '', field3: 1 } : undefined,
      })
      const res = await this.sendPB('trpc.qq_new_tech.status_svc.StatusService.SetStatus', body)
      const { message } = Action.SetStatusResp.decode(Buffer.from(res.pb, 'hex'))
      return { message: message || '' }
    }
  }
}
