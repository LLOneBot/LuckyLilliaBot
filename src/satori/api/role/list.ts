import { GuildRole, List } from '@satorijs/protocol'
import { Handler } from '../index'

interface Payload {
  guild_id: string
  next?: string
}

export const getGuildRoleList: Handler<List<Partial<GuildRole>>, Payload> = () => {
  return {
    data: [
      {
        id: '4',
        name: 'owner'
      },
      {
        id: '3',
        name: 'admin'
      },
      {
        id: '2',
        name: 'member'
      }
    ]
  }
}
