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
        id: '1',
        name: 'owner'
      },
      {
        id: '2',
        name: 'admin'
      },
      {
        id: '0',
        name: 'member'
      }
    ]
  }
}
