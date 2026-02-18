import { GuildMember, List } from '@satorijs/protocol'
import { Handler } from '../index'
import { decodeGuildMember } from '../../utils'

interface Payload {
  guild_id: string
  next?: string
}

export const getGuildMemberList: Handler<List<GuildMember>, Payload> = async (ctx, payload) => {
  async function getMembers(forceFetch: boolean) {
    const res = await ctx.ntGroupApi.getGroupMembers(payload.guild_id, forceFetch)
    if (res.errCode !== 0) {
      throw new Error(res.errMsg)
    }
    return res.result
  }
  let result
  let cached = false
  try {
    result = await getMembers(false)
    cached = true
  } catch {
    result = await getMembers(true)
  }
  if (cached) {
    const { memberNum } = await ctx.ntGroupApi.getGroupAllInfo(payload.guild_id)
    // 使用缓存可能导致群成员列表不完整
    if (memberNum !== result.infos.size) {
      result = await getMembers(true)
    }
  }
  return {
    data: result.infos.values().map(decodeGuildMember).toArray()
  }
}
