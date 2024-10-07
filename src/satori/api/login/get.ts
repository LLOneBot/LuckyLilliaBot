import { Login, Status, Methods } from '@satorijs/protocol'
import { decodeUser } from '../../utils'
import { selfInfo } from '@/common/globalVars'
import { Handler } from '../index'
import { handlers } from '../index'

export const getLogin: Handler<Login> = async (ctx) => {
  const features: string[] = []
  for (const [feature, info] of Object.entries(Methods)) {
    if (info.name in handlers) {
      features.push(feature)
    }
  }
  features.push('guild.plain')
  await ctx.ntUserApi.getSelfNick()
  return {
    user: decodeUser(selfInfo),
    adapter: 'llonebot',
    platform: 'llonebot',
    status: selfInfo.online ? Status.ONLINE : Status.OFFLINE,
    features,
    proxy_urls: []
  }
}
