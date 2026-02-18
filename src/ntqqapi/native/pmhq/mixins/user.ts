import { Action, Misc, Oidb } from '@/ntqqapi/proto'
import type { PMHQBase } from '../base'

export function UserMixin<T extends new (...args: any[]) => PMHQBase>(Base: T) {
  return class extends Base {
    async fetchUserInfo(uin: number) {
      const body = Oidb.FetchUserInfoReq.encode({
        uin,
        keys: [
          { key: 102 },  // 个性签名
          { key: 104 },  // 标签
          { key: 105 },  // 等级
          { key: 20002 },  // 昵称
          { key: 20003 },  // 国家
          { key: 20009 },  // 性别
          { key: 20020 },  // 城市
          { key: 20026 },  // 注册时间
          { key: 20031 },  // 生日
          { key: 20037 },  // 年龄
          { key: 27394 },  // QID
        ],
      })
      const data = Oidb.Base.encode({
        command: 0xfe1,
        subCommand: 2,
        body,
        isReserved: 1,
      })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0xfe1_2', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      const info = Oidb.FetchUserInfoResp.decode(oidbRespBody)
      const numbers = Object.fromEntries(info.body.properties.numberProperties.map(p => [p.key, p.value]))
      const bytes = Object.fromEntries(info.body.properties.bytesProperties.map(p => [p.key, p.value]))
      return {
        uin: info.body.uin,
        nick: bytes[20002]?.toString() ?? '',
        sex: numbers[20009] ?? 0,
        age: numbers[20037] ?? 0,
        qid: bytes[27394]?.toString() ?? '',
        level: numbers[105],
        regTime: numbers[20026] ?? 0,
        longNick: bytes[102].toString(),
        city: bytes[20020]?.toString() ?? '',
        country: bytes[20003]?.toString() ?? '',
        birthdayYear: (bytes[20031]?.[0] << 8) | bytes[20031]?.[1],
        birthdayMonth: bytes[20031]?.[2] ?? 0,
        birthdayDay: bytes[20031]?.[3] ?? 0,
        labels: bytes[104] ? Misc.UserInfoLabel.decode(bytes[104]).labels.map(e => e.content) : [],
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
      const res = await this.httpSendPB('MQUpdateSvc_com_qq_ti.web.OidbSvc.0xdef_1', body)
      const { json } = Action.FetchUserLoginDaysResp.decode(Buffer.from(res.pb, 'hex'))
      return (
        JSON.parse(json).msg_rsp_basic_info.rpt_msg_basic_info.find((e: any) => e.uint64_uin === uin)
          ?.uint32_login_days || 0
      )
    }
  }
}
