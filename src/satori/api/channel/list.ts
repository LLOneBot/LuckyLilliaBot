import { Channel, List } from '@satorijs/protocol'
import { Handler } from '../index'

interface Payload {
  guild_id: string
  next?: string
}

export const getChannelList: Handler<List<Channel>, Payload> = async (ctx, payload) => {
  const info = await ctx.ntGroupApi.getGroupAllInfo(payload.guild_id)
  return {
    data: [{
      id: payload.guild_id,
      type: Channel.Type.TEXT,
      name: info.groupName
    }]
  }
}
