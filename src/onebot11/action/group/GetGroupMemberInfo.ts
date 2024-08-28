import BaseAction from '../BaseAction'
import { OB11GroupMember } from '../../types'
import { OB11Constructor } from '../../constructor'
import { ActionName } from '../types'
import { selfInfo } from '@/common/globalVars'
import { isNullable } from 'cosmokit'

interface Payload {
  group_id: number | string
  user_id: number | string
}

class GetGroupMemberInfo extends BaseAction<Payload, OB11GroupMember> {
  actionName = ActionName.GetGroupMemberInfo

  protected async _handle(payload: Payload) {
    const member = await this.ctx.ntGroupApi.getGroupMember(payload.group_id.toString(), payload.user_id.toString())
    if (member) {
      if (isNullable(member.sex)) {
        //log('获取群成员详细信息')
        const info = await this.ctx.ntUserApi.getUserDetailInfo(member.uid, true)
        //log('群成员详细信息结果', info)
        Object.assign(member, info)
      }
      const ret = OB11Constructor.groupMember(payload.group_id.toString(), member)
      const self = await this.ctx.ntGroupApi.getGroupMember(payload.group_id.toString(), selfInfo.uid)
      if (self?.role === 3 || self?.role === 4) {
        const webGroupMembers = await this.ctx.ntWebApi.getGroupMembers(payload.group_id.toString())
        const target = webGroupMembers.find(e => e?.uin && e.uin === ret.user_id)
        if (target) {
          ret.join_time = target.join_time
          ret.last_sent_time = target.last_speak_time
          ret.qage = target.qage
          ret.level = target.lv.level.toString()
        }
      }
      const date = Math.round(Date.now() / 1000)
      ret.last_sent_time ||= Number(member.lastSpeakTime || date)
      ret.join_time ||= Number(member.joinTime || date)
      return ret
    } else {
      throw `群成员${payload.user_id}不存在`
    }
  }
}

export default GetGroupMemberInfo
