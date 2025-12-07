import { defineApi, Failed, MilkyApiHandler, Ok } from '@/milky/common/api'
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
  GetCookiesInput,
  GetCookiesOutput,
  GetCSRFTokenOutput,
} from '@saltify/milky-types'
import z from 'zod'
import { selfInfo } from '@/common/globalVars'

const GetLoginInfo = defineApi(
  'get_login_info',
  z.object({}),
  GetLoginInfoOutput,
  async (ctx) => {
    let nickname = selfInfo.nick
    try {
      nickname = await ctx.ntUserApi.getSelfNick(true)
    } catch { }
    return Ok({
      uin: +selfInfo.uin,
      nickname,
    })
  },
)

const GetImplInfo = defineApi(
  'get_impl_info',
  z.object({}),
  GetImplInfoOutput,
  async (ctx) => {
    const deviceInfo = await ctx.ntSystemApi.getDeviceInfo()
    return Ok({
      impl_name: 'LLBot',
      impl_version: version,
      qq_protocol_version: deviceInfo.buildVer,
      qq_protocol_type: transformProtocolOsType(deviceInfo.devType),
      milky_version: '1.0',
    })
  },
)

const GetUserProfile = defineApi(
  'get_user_profile',
  GetUserProfileInput,
  GetUserProfileOutput,
  async (ctx, payload) => {
    const userInfo = await ctx.ntUserApi.getUserDetailInfoByUin(payload.user_id.toString())
    if (userInfo.result !== 0) {
      return Failed(-500, userInfo.errMsg)
    }
    const profile = {
      nickname: userInfo.detail.simpleInfo.coreInfo.nick,
      qid: userInfo.detail.simpleInfo.baseInfo.qid,
      age: userInfo.detail.simpleInfo.baseInfo.age,
      sex: transformGender(userInfo.detail.simpleInfo.baseInfo.sex),
      remark: userInfo.detail.simpleInfo.coreInfo.remark,
      bio: userInfo.detail.simpleInfo.baseInfo.longNick,
      level: userInfo.detail.commonExt?.qqLevel ?
        (userInfo.detail.commonExt.qqLevel.penguinNum * 256 + userInfo.detail.commonExt.qqLevel.crownNum * 64 +
          userInfo.detail.commonExt.qqLevel.sunNum * 16 + userInfo.detail.commonExt.qqLevel.moonNum * 4 +
          userInfo.detail.commonExt.qqLevel.starNum) : 0,
      country: userInfo.detail.commonExt?.country || '',
      city: userInfo.detail.commonExt?.city || '',
      school: userInfo.detail.commonExt?.college || '',
    }
    if (profile.level === 0) {
      profile.level = await ctx.app.pmhq.fetchUserLevel(payload.user_id)
    }
    return Ok(profile)
  }
)

const GetFriendList = defineApi(
  'get_friend_list',
  GetFriendListInput,
  GetFriendListOutput,
  async (ctx, payload) => {
    const friends = await ctx.ntFriendApi.getBuddyList()
    const friendList: GetFriendListOutput['friends'] = []
    for (const friend of friends) {
      const category = await ctx.ntFriendApi.getCategoryById(friend.baseInfo.categoryId)
      friendList.push(transformFriend(friend, category))
    }
    return Ok({
      friends: friendList,
    })
  }
)

const GetFriendInfo = defineApi(
  'get_friend_info',
  GetFriendInfoInput,
  GetFriendInfoOutput,
  async (ctx, payload) => {
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) {
      return Failed(-404, 'User not found')
    }
    const friend = await ctx.ntUserApi.getUserSimpleInfo(uid)
    const category = await ctx.ntFriendApi.getCategoryById(friend.baseInfo.categoryId)
    return Ok({
      friend: transformFriend(friend, category),
    })
  }
)

const GetGroupList = defineApi(
  'get_group_list',
  GetGroupListInput,
  GetGroupListOutput,
  async (ctx, payload) => {
    const groups = await ctx.ntGroupApi.getGroups(payload.no_cache)
    return Ok({
      groups: groups.map(e => {
        return {
          group_id: +e.groupCode,
          group_name: e.groupName,
          member_count: e.memberCount,
          max_member_count: e.maxMember
        }
      }),
    })
  }
)

const GetGroupInfo = defineApi(
  'get_group_info',
  GetGroupInfoInput,
  GetGroupInfoOutput,
  async (ctx, payload) => {
    const group = await ctx.ntGroupApi.getGroupAllInfo(payload.group_id.toString())
    return Ok({
      group: transformGroup(group),
    })
  }
)

const GetGroupMemberList = defineApi(
  'get_group_member_list',
  GetGroupMemberListInput,
  GetGroupMemberListOutput,
  async (ctx, payload) => {
    const result = await ctx.ntGroupApi.getGroupMembers(payload.group_id.toString())
    if (result.errCode !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({
      members: result.result.infos.values().map(e => transformGroupMember(e, payload.group_id)).toArray(),
    })
  }
)

const GetGroupMemberInfo = defineApi(
  'get_group_member_info',
  GetGroupMemberInfoInput,
  GetGroupMemberInfoOutput,
  async (ctx, payload) => {
    const groupCode = payload.group_id.toString()
    const memberUid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString(), groupCode)
    if (!memberUid) {
      return Failed(-404, 'Member not found')
    }
    const member = await ctx.ntGroupApi.getGroupMember(
      groupCode,
      memberUid
    )
    return Ok({
      member: transformGroupMember(member, payload.group_id),
    })
  }
)

const GetCookies = defineApi(
  'get_cookies',
  GetCookiesInput,
  GetCookiesOutput,
  async (ctx, payload) => {
    const blackList = ['pay.qq.com']
    if (blackList.includes(payload.domain)) {
      throw new Error('该域名禁止获取cookie')
    }
    const cookiesObject = await ctx.ntUserApi.getCookies(payload.domain)
    //把获取到的cookiesObject转换成 k=v; 格式字符串拼接在一起
    const cookies = Object.entries(cookiesObject).map(([key, value]) => `${key}=${value}`).join('; ')
    return Ok({ cookies })
  }
)

const GetCSRFToken = defineApi(
  'get_csrf_token',
  z.object({}),
  GetCSRFTokenOutput,
  async (ctx, payload) => {
    const cookiesObject = await ctx.ntUserApi.getCookies('h5.qzone.qq.com')
    const csrfToken = ctx.ntWebApi.genBkn(cookiesObject.skey)
    return Ok({ csrf_token: csrfToken })
  }
)

export const SystemApi: MilkyApiHandler[] = [
  GetLoginInfo,
  GetImplInfo,
  GetUserProfile,
  GetFriendList,
  GetFriendInfo,
  GetGroupList,
  GetGroupInfo,
  GetGroupMemberList,
  GetGroupMemberInfo,
  GetCookies,
  GetCSRFToken
]
