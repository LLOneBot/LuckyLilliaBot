import { defineApi, Failed, Ok } from '@/milky/common/api'
import { version } from '../../version'
import { transformFriend, transformGender, transformGroup, transformGroupMember } from '@/milky/transform/entity'
import { transformProtocolOsType } from '@/milky/transform/system'
import {
  GetImplInfoOutput,
  GetLoginInfoOutput,
  GetUserProfileInput,
  GetUserProfileOutput,
  GetFriendListInput,
  GetFriendListOutput,
  GetFriendInfoInput,
  GetFriendInfoOutput,
  GetGroupListInput,
  GetGroupListOutput,
  GetGroupInfoInput,
  GetGroupInfoOutput,
  GetGroupMemberListInput,
  GetGroupMemberListOutput,
  GetGroupMemberInfoInput,
  GetGroupMemberInfoOutput,
} from '@saltify/milky-types'
import z from 'zod'
import { Sex } from '@/ntqqapi/types'
import { selfInfo } from '@/common/globalVars'

export const GetLoginInfo = defineApi(
  'get_login_info',
  z.object({}),
  GetLoginInfoOutput,
  async (ctx) => {
    return Ok({
      uin: parseInt(selfInfo.uin),
      nickname: selfInfo.nick,
    })
  },
)

export const GetImplInfo = defineApi(
  'get_impl_info',
  z.object({}),
  GetImplInfoOutput,
  async (ctx) => Ok({
    impl_name: 'LLOneBot',
    impl_version: version,
    qq_protocol_version: 'NTQQ',
    qq_protocol_type: transformProtocolOsType(),
    milky_version: '1.0',
  }),
)

export const GetUserProfile = defineApi(
  'get_user_profile',
  GetUserProfileInput,
  GetUserProfileOutput,
  async (ctx, payload) => {
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) {
      return Failed(-404, 'User not found')
    }
    const userInfo = await ctx.ntUserApi.fetchUserDetailInfo(uid)
    if (!userInfo) {
      return Failed(-404, 'User not found')
    }
    return Ok({
      nickname: userInfo.simpleInfo.coreInfo.nick,
      qid: userInfo.simpleInfo.baseInfo?.qid || '',
      age: userInfo.simpleInfo.baseInfo?.age || 0,
      sex: transformGender(userInfo.simpleInfo.baseInfo?.sex || Sex.Unknown),
      remark: userInfo.simpleInfo.coreInfo.remark || '',
      bio: userInfo.simpleInfo.baseInfo?.longNick || '',
      level: userInfo.commonExt?.qqLevel ?
        (userInfo.commonExt.qqLevel.crownNum * 64 + userInfo.commonExt.qqLevel.sunNum * 16 +
          userInfo.commonExt.qqLevel.moonNum * 4 + userInfo.commonExt.qqLevel.starNum) : 0,
      country: userInfo.commonExt?.country || '',
      city: userInfo.commonExt?.city || '',
      school: userInfo.commonExt?.college || '',
    })
  }
)

export const GetFriendList = defineApi(
  'get_friend_list',
  GetFriendListInput,
  GetFriendListOutput,
  async (ctx, payload) => {
    const friends = await ctx.ntFriendApi.getBuddyList()
    const friendList = []
    // Create a default category for friends
    const defaultCategory = {
      categoryId: 0,
      categorySortId: 0,
      categroyName: '我的好友',
      categroyMbCount: friends.length,
      onlineCount: 0,
      buddyList: friends,
      buddyUids: [],
    }
    for (const friend of friends) {
      friendList.push(transformFriend(friend, defaultCategory))
    }
    return Ok({
      friends: friendList,
    })
  }
)

export const GetFriendInfo = defineApi(
  'get_friend_info',
  GetFriendInfoInput,
  GetFriendInfoOutput,
  async (ctx, payload) => {
    const friends = await ctx.ntFriendApi.getBuddyList()
    const friend = friends.find(f =>
      (f.uin && parseInt(f.uin) === payload.user_id) ||
      (f.coreInfo?.uin && parseInt(f.coreInfo.uin) === payload.user_id)
    )

    if (!friend) {
      return Failed(-404, 'Friend not found')
    }

    const defaultCategory = {
      categoryId: 0,
      categorySortId: 0,
      categroyName: '我的好友',
      categroyMbCount: friends.length,
      onlineCount: 0,
      buddyList: friends,
      buddyUids: [],
    }

    return Ok({
      friend: transformFriend(friend, defaultCategory),
    })
  }
)

export const GetGroupList = defineApi(
  'get_group_list',
  GetGroupListInput,
  GetGroupListOutput,
  async (ctx, payload) => {
    const groups = await ctx.ntGroupApi.getGroups(payload.no_cache)
    return Ok({
      groups: groups.map(transformGroup),
    })
  }
)

export const GetGroupInfo = defineApi(
  'get_group_info',
  GetGroupInfoInput,
  GetGroupInfoOutput,
  async (ctx, payload) => {
    const groups = await ctx.ntGroupApi.getGroups()
    const group = groups.find(g => g.groupCode === payload.group_id.toString())
    if (!group) {
      return Failed(-404, 'Group not found')
    }
    return Ok({
      group: transformGroup(group),
    })
  }
)

export const GetGroupMemberList = defineApi(
  'get_group_member_list',
  GetGroupMemberListInput,
  GetGroupMemberListOutput,
  async (ctx, payload) => {
    const members = await ctx.ntGroupApi.getGroupMembers(payload.group_id.toString())
    if (!members) {
      return Failed(-404, 'Group not found')
    }
    return Ok({
      members: Array.from(members.values()).map(transformGroupMember),
    })
  }
)

export const GetGroupMemberInfo = defineApi(
  'get_group_member_info',
  GetGroupMemberInfoInput,
  GetGroupMemberInfoOutput,
  async (ctx, payload) => {
    const member = await ctx.ntGroupApi.getGroupMember(
      payload.group_id.toString(),
      payload.user_id.toString()
    )
    if (!member) {
      return Failed(-404, 'Member not found')
    }
    return Ok({
      member: transformGroupMember(member),
    })
  }
)

export const SystemApi = [
  GetLoginInfo,
  GetImplInfo,
  GetUserProfile,
  GetFriendList,
  GetFriendInfo,
  GetGroupList,
  GetGroupInfo,
  GetGroupMemberList,
  GetGroupMemberInfo,
]
