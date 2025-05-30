import SatoriAdapter from '../adapter'
import { RawMessage, GroupNotify } from '@/ntqqapi/types'
import { decodeGuild, decodeUser } from '../utils'

export async function parseGuildMemberAdded(bot: SatoriAdapter, input: RawMessage, isBot = false) {
  const groupAll = await bot.ctx.ntGroupApi.getGroupAllInfo(input.peerUid)

  let memberUid: string | undefined
  if (input.elements[0].grayTipElement?.groupElement) {
    memberUid = input.elements[0].grayTipElement.groupElement.memberUid
  } else if (input.elements[0].grayTipElement?.jsonGrayTipElement) {
    const json = JSON.parse(input.elements[0].grayTipElement.jsonGrayTipElement.jsonStr)
    const uin = new URL(json.items[2].jp).searchParams.get('robot_uin')
    if (!uin) return
    memberUid = await bot.ctx.ntUserApi.getUidByUin(uin)
  } else {
    const iterator = input.elements[0].grayTipElement?.xmlElement?.members.keys()
    iterator?.next()
    memberUid = iterator?.next().value
  }
  if (!memberUid) return

  const user = decodeUser((await bot.ctx.ntUserApi.getUserSimpleInfo(memberUid)).coreInfo)
  user.is_bot = isBot

  return bot.event('guild-member-added', {
    guild: decodeGuild(groupAll),
    user,
    member: {
      user,
      nick: user.name
    }
  })
}

export async function parseGuildMemberRemoved(bot: SatoriAdapter, input: GroupNotify) {
  const user = decodeUser((await bot.ctx.ntUserApi.getUserSimpleInfo(input.user1.uid)).coreInfo)

  return bot.event('guild-member-removed', {
    guild: decodeGuild(input.group),
    user,
    member: {
      user,
      nick: user.name
    }
  })
}

export async function parseGuildMemberRequest(bot: SatoriAdapter, input: GroupNotify, doubt: boolean) {
  const groupCode = input.group.groupCode
  const flag = `${groupCode}|${input.seq}|${input.type}|${doubt === true ? '1' : '0'}`

  return bot.event('guild-member-request', {
    guild: decodeGuild(input.group),
    message: {
      id: flag,
      content: input.postscript
    }
  })
}
