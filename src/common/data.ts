import {
  type Friend,
  type Group,
  type GroupMember,
  type SelfInfo,
} from '../ntqqapi/types'
import { type LLOneBotError } from './types'
import { NTQQGroupApi } from '../ntqqapi/api/group'
import { log } from './utils/log'
import { isNumeric } from './utils/helper'
import { NTQQFriendApi, NTQQUserApi } from '../ntqqapi/api'

export let groups: Group[] = []
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
  let filterKey = isNumeric(uinOrUid.toString()) ? 'uin' : 'uid'
  let filterValue = uinOrUid
  let friend = friends.find((friend) => friend[filterKey] === filterValue.toString())
  if (!friend) {
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

export async function getGroup(qq: string): Promise<Group | undefined> {
  let group = groups.find((group) => group.groupCode === qq.toString())
  if (!group) {
    try {
      const _groups = await NTQQGroupApi.getGroups(true)
      group = _groups.find((group) => group.groupCode === qq.toString())
      if (group) {
        groups.push(group)
      }
    } catch (e) {
    }
  }
  return group
}

export function deleteGroup(groupCode: string) {
  const groupIndex = groups.findIndex((group) => group.groupCode === groupCode.toString())
  // log(groups, groupCode, groupIndex);
  if (groupIndex !== -1) {
    log('删除群', groupCode)
    groups.splice(groupIndex, 1)
  }
}

export async function getGroupMember(groupQQ: string | number, memberUinOrUid: string | number) {
  groupQQ = groupQQ.toString()
  memberUinOrUid = memberUinOrUid.toString()
  let members = groupMembers.get(groupQQ)
  if (!members) {
    try {
      members = await NTQQGroupApi.getGroupMembers(groupQQ)
      // 更新群成员列表
      groupMembers.set(groupQQ, members)
    }
    catch (e) {
      return null
    }
  }
  const getMember = () => {
    let member: GroupMember | undefined = undefined
    if (isNumeric(memberUinOrUid)) {
      member = Array.from(members!.values()).find(member => member.uin === memberUinOrUid)
    } else {
      member = members!.get(memberUinOrUid)
    }
    return member
  }
  let member = getMember()
  if (!member) {
    members = await NTQQGroupApi.getGroupMembers(groupQQ)
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
