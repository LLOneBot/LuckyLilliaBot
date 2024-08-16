import {
  type Friend,
  type GroupMember,
  type SelfInfo,
} from '../ntqqapi/types'
import { type LLOneBotError } from './types'
import { NTQQGroupApi } from '../ntqqapi/api/group'
import { log } from './utils/log'
import { isNumeric } from './utils/helper'
import { NTQQFriendApi, NTQQUserApi } from '../ntqqapi/api'
import { RawMessage } from '../ntqqapi/types'
import { getConfigUtil } from './config'
import { getBuildVersion } from './utils/QQBasicInfo'

export let friends: Friend[] = []
export const llonebotError: LLOneBotError = {
  ffmpegError: '',
  httpServerError: '',
  wsServerError: '',
  otherError: 'LLOneBot 未能正常启动，请检查日志查看错误',
}
// 群号 -> 群成员map(uid=>GroupMember)
export const groupMembers: Map<string, Map<string, GroupMember>> = new Map<string, Map<string, GroupMember>>()

export async function getFriend(uinOrUid: string): Promise<Friend | undefined> {
  const filterKey: 'uin' | 'uid' = isNumeric(uinOrUid.toString()) ? 'uin' : 'uid'
  const filterValue = uinOrUid
  let friend = friends.find((friend) => friend[filterKey] === filterValue.toString())
  if (!friend && getBuildVersion() < 26702) {
    try {
      const _friends = await NTQQFriendApi.getFriends(true)
      friend = _friends.find((friend) => friend[filterKey] === filterValue.toString())
      if (friend) {
        friends.push(friend)
      }
    } catch (e: any) {
      log('刷新好友列表失败', e.stack.toString())
    }
  }
  return friend
}

export async function getGroupMember(groupCode: string | number, memberUinOrUid: string | number) {
  const groupCodeStr = groupCode.toString()
  const memberUinOrUidStr = memberUinOrUid.toString()
  let members = groupMembers.get(groupCodeStr)
  if (!members) {
    try {
      members = await NTQQGroupApi.getGroupMembers(groupCodeStr)
      // 更新群成员列表
      groupMembers.set(groupCodeStr, members)
    }
    catch (e) {
      return null
    }
  }
  const getMember = () => {
    let member: GroupMember | undefined = undefined
    if (isNumeric(memberUinOrUidStr)) {
      member = Array.from(members!.values()).find(member => member.uin === memberUinOrUidStr)
    } else {
      member = members!.get(memberUinOrUidStr)
    }
    return member
  }
  let member = getMember()
  if (!member) {
    members = await NTQQGroupApi.getGroupMembers(groupCodeStr)
    member = getMember()
  }
  return member
}

const selfInfo: SelfInfo = {
  uid: '',
  uin: '',
  nick: '',
  online: true,
}

export async function getSelfNick(force = false): Promise<string> {
  if ((!selfInfo.nick || force) && selfInfo.uid) {
    const userInfo = await NTQQUserApi.getUserDetailInfo(selfInfo.uid)
    if (userInfo) {
      selfInfo.nick = userInfo.nick
      return userInfo.nick
    }
  }

  return selfInfo.nick
}

export function getSelfInfo() {
  return selfInfo
}

export function setSelfInfo(data: Partial<SelfInfo>) {
  Object.assign(selfInfo, data)
}

export function getSelfUid() {
  return selfInfo['uid']
}

export function getSelfUin() {
  return selfInfo['uin']
}

const messages: Map<string, RawMessage> = new Map()
let expire: number

/** 缓存近期消息内容 */
export async function addMsgCache(msg: RawMessage) {
  expire ??= getConfigUtil().getConfig().msgCacheExpire! * 1000
  if (expire === 0) {
    return
  }
  const id = msg.msgId
  messages.set(id, msg)
  setTimeout(() => {
    messages.delete(id)
  }, expire)
}

/** 获取近期消息内容 */
export function getMsgCache(msgId: string) {
  return messages.get(msgId)
}