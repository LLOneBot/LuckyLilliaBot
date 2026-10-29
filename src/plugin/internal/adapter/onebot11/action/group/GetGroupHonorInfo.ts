import { ActionName } from '../types'
import { BaseAction, Schema } from '../BaseAction'

interface Payload {
  group_id: number | string
  type: 'talkative' | 'performer' | 'legend' | 'strong_newbie' | 'emotion' | 'all'
}

interface HonorMemberInfo {
  user_id: number
  nickname: string
  avatar: string
  description: string
}

interface Response {
  group_id: number
  current_talkative?: {
    user_id: number
    nickname: string
    avatar: string
    day_count: number
  }
  talkative_list?: HonorMemberInfo[]
  performer_list?: HonorMemberInfo[]
  legend_list?: HonorMemberInfo[]
  strong_newbie_list?: HonorMemberInfo[]
  emotion_list?: HonorMemberInfo[]
}

export class GetGroupHonorInfo extends BaseAction<Payload, Response> {
  actionName = ActionName.GetGroupHonorInfo
  payloadSchema = Schema.object({
    group_id: Schema.union([Number, String]).required(),
    type: Schema.union(['talkative', 'performer', 'legend', 'strong_newbie', 'emotion', 'all']).default('all')
  })

  protected async _handle(payload: Payload) {
    const groupCode = +payload.group_id
    const pSkey = (await this.ctx.ntUserApi.getPSkey(['qun.qq.com'])).get('qun.qq.com')!
    const ret: Response = { group_id: groupCode }

    let talkative, performer, legend, emotion
    if (payload.type === 'all') {
      const resps = await Promise.all([
        this.ctx.ntWebApi.getGroupHonorTalkative(groupCode, pSkey),
        this.ctx.ntWebApi.getGroupHonorContinuous(groupCode, 2, pSkey),
        this.ctx.ntWebApi.getGroupHonorContinuous(groupCode, 3, pSkey),
        this.ctx.ntWebApi.getGroupHonorEmotion(groupCode, pSkey)
      ])
      talkative = resps[0]
      performer = resps[1]
      legend = resps[2]
      emotion = resps[3]
    }

    if (payload.type === 'talkative' || payload.type === 'all') {
      const resp = talkative ?? await this.ctx.ntWebApi.getGroupHonorTalkative(groupCode, pSkey)
      if (resp.retcode !== 0) {
        throw new Error(resp.msg)
      }
      const { data } = resp
      if (data.current_talkative) {
        ret.current_talkative = {
          user_id: data.current_talkative.uin,
          nickname: data.current_talkative.nick,
          avatar: data.current_talkative.avatar,
          day_count: data.current_talkative.day_count
        }
      }
      ret.talkative_list = data.talkative_list.map(t => ({
        user_id: t.uin,
        nickname: t.nick,
        avatar: t.avatar,
        description: `${t.day_count_history}天，最长蝉联${t.day_count_max}天`
      }))
    }
    if (payload.type === 'performer' || payload.type === 'all') {
      const resp = performer ?? await this.ctx.ntWebApi.getGroupHonorContinuous(groupCode, 2, pSkey)
      if (resp.retcode !== 0) {
        throw new Error(resp.msg)
      }
      const { data } = resp
      ret.performer_list = data.continuous_list.map(c => ({
        user_id: c.uin,
        nickname: c.nick,
        avatar: c.avatar,
        description: `连续发消息${c.day_count}天`
      }))
    }
    if (payload.type === 'legend' || payload.type === 'all') {
      const resp = legend ?? await this.ctx.ntWebApi.getGroupHonorContinuous(groupCode, 3, pSkey)
      if (resp.retcode !== 0) {
        throw new Error(resp.msg)
      }
      const { data } = resp
      ret.legend_list = data.continuous_list.map(c => ({
        user_id: c.uin,
        nickname: c.nick,
        avatar: c.avatar,
        description: `连续发消息${c.day_count}天`
      }))
    }
    if (payload.type === 'strong_newbie' || payload.type === 'all') {
      ret.strong_newbie_list = []
    }
    if (payload.type === 'emotion' || payload.type === 'all') {
      const resp = emotion ?? await this.ctx.ntWebApi.getGroupHonorEmotion(groupCode, pSkey)
      if (resp.retcode !== 0) {
        throw new Error(resp.msg)
      }
      const { data } = resp
      ret.emotion_list = data.emotion_list.map(e => ({
        user_id: e.uin,
        nickname: e.nick,
        avatar: e.avatar,
        description: `已连续发送表情包${e.day_count}天`
      }))
    }

    return ret
  }
}
