import { Login, Status, Methods } from '@satorijs/protocol'
import { decodeUser } from '@/plugin/internal/service/ntqq-universal/utils'
import { selfInfo } from '@/common/globalVars'
import { Handler } from '..'
import { handlers } from '..'

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
    sn: ctx.get('satori')!._loginSeq,
    user: decodeUser(selfInfo),
    adapter: 'llonebot',
    platform: 'llonebot',
    status: selfInfo.online ? Status.ONLINE : Status.OFFLINE,
    features,
    proxy_urls: []
  }
}
