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
  SetAvatarInput,
  SetNicknameInput,
  SetBioInput,
  GetCustomFaceUrlListOutput,
  GetPeerPinsOutput,
  SetPeerPinInput,
} from '@saltify/milky-types'
import z from 'zod'
import { selfInfo, TEMP_DIR } from '@/common/globalVars'
import { resolveMilkyUri } from '@/milky/common/download'
import { unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { sleep } from '@/common/utils'
import { ChatType } from '@/ntqqapi/types'
import { noop } from 'cosmokit'

const GetLoginInfo = defineApi(
  'get_login_info',
  z.object({}),
  GetLoginInfoOutput,
  async (ctx) => {
    for (let i = 0; i < 5; i++) {
      try {
        await ctx.ntUserApi.getSelfNick(true)
        break
      } catch {
        await sleep(500)
      }
    }
    return Ok({
      uin: +selfInfo.uin,
      nickname: selfInfo.nick,
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
      milky_version: '1.2',
    })
  },
)

const GetUserProfile = defineApi(
  'get_user_profile',
  GetUserProfileInput,
  GetUserProfileOutput,
  async (ctx, payload) => {
    const info = await ctx.pmhq.fetchUserInfo(payload.user_id)
    return Ok({
      nickname: info.nick,
      qid: info.qid,
      age: info.age,
      sex: transformGender(info.sex),
      remark: info.remark,
      bio: info.longNick,
      level: info.level,
      country: info.country,
      city: info.city,
      school: info.school,
    })
  }
)

const GetFriendList = defineApi(
  'get_friend_list',
  GetFriendListInput,
  GetFriendListOutput,
  async (ctx, payload) => {
    const result = await ctx.ntFriendApi.getFriendList(payload.no_cache)
    const friendList = []
    for (const friend of result.friends) {
      friendList.push(transformFriend(friend, result.categories.get(friend.categoryId)!))
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
    const result = await ctx.ntFriendApi.getFriendInfoByUin(payload.user_id, payload.no_cache)
    if (!result) {
      return Failed(-404, 'Friend not found')
    }
    return Ok({
      friend: transformFriend(result.friend, result.category),
    })
  }
)

const GetGroupList = defineApi(
  'get_group_list',
  GetGroupListInput,
  GetGroupListOutput,
  async (ctx) => {
    const { groups } = await ctx.pmhq.fetchGroups()
    return Ok({
      groups: groups.map(e => {
        return {
          group_id: e.groupCode,
          group_name: e.info.groupName,
          member_count: e.info.memberCount,
          max_member_count: e.info.memberMax,
          remark: e.customInfo.remark ?? '',
          created_time: e.info.createdTime,
          description: e.info.richDescription ?? '',
          question: e.info.question ?? '',
          announcement: e.info.announcement ?? ''
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
    const group = await ctx.ntGroupApi.getGroupDetailInfo(payload.group_id.toString())
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
    const groupCode = payload.group_id.toString()
    async function getMembers(forceFetch: boolean) {
      const res = await ctx.ntGroupApi.getGroupMembers(groupCode, forceFetch)
      if (res.errCode !== 0) {
        throw new Error(res.errMsg)
      }
      return res.result
    }
    let result
    try {
      if (payload.no_cache) {
        result = await getMembers(true)
      } else {
        let cached = false
        try {
          result = await getMembers(false)
          cached = true
        } catch {
          result = await getMembers(true)
        }
        if (cached) {
          const { memberNum } = await ctx.ntGroupApi.getGroupAllInfo(groupCode)
          // 使用缓存可能导致群成员列表不完整
          if (memberNum !== result.infos.size) {
            result = await getMembers(true)
          }
        }
      }
    } catch (e) {
      return Failed(-500, (e as Error).message)
    }
    return Ok({
      members: result.infos.values().map(e => transformGroupMember(e, payload.group_id)).toArray(),
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
      memberUid,
      payload.no_cache
    )
    return Ok({
      member: transformGroupMember(member, payload.group_id),
    })
  }
)

const GetPeerPins = defineApi(
  'get_peer_pins',
  z.object({}),
  GetPeerPinsOutput,
  async (ctx) => {
    const result = await ctx.ntSystemApi.getPins()
    return Ok({
      friends: await Promise.all(
        result.friends.map(async (e) => {
          const info = await ctx.ntFriendApi.getFriendInfoByUid(e.uid, false)
          return transformFriend(info!.friend, info!.category)
        })
      ),
      groups: await Promise.all(
        result.groups.map(async (e) => {
          const info = await ctx.ntGroupApi.getGroupDetailInfo(e.groupCode.toString())
          return transformGroup(info)
        })
      )
    })
  }
)

const SetPeerPin = defineApi(
  'set_peer_pin',
  SetPeerPinInput,
  z.object({}),
  async (ctx, payload) => {
    if (payload.message_scene === 'friend') {
      const uid = await ctx.ntUserApi.getUidByUin(payload.peer_id.toString())
      const result = await ctx.ntFriendApi.setTop(uid, payload.is_pinned)
      if (result.result !== 0) {
        return Failed(-500, result.errMsg)
      }
    } else if (payload.message_scene === 'group') {
      const result = await ctx.ntGroupApi.setTop(payload.peer_id.toString(), payload.is_pinned)
      if (result.result !== 0) {
        return Failed(-500, result.errMsg)
      }
    } else if (payload.message_scene === 'temp') {
      const uid = await ctx.ntUserApi.getUidByUin(payload.peer_id.toString())
      const result = await ctx.ntMsgApi.setContactLocalTop({
        chatType: ChatType.TempC2CFromGroup,
        peerUid: uid,
        guildId: ''
      }, payload.is_pinned)
      if (result.result !== 0) {
        return Failed(-500, result.errMsg)
      }
    }
    return Ok({})
  }
)

const SetAvatar = defineApi(
  'set_avatar',
  SetAvatarInput,
  z.object({}),
  async (ctx, payload) => {
    const data = await resolveMilkyUri(payload.uri)
    const tempPath = path.join(TEMP_DIR, `avatar-${randomUUID()}`)
    await writeFile(tempPath, data)
    const result = await ctx.ntUserApi.setSelfAvatar(tempPath)
    unlink(tempPath).catch(noop)
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

const SetNickname = defineApi(
  'set_nickname',
  SetNicknameInput,
  z.object({}),
  async (ctx, payload) => {
    const old = (await ctx.ntUserApi.getUserDetailInfoWithBizInfo(selfInfo.uid)).simpleInfo
    const result = await ctx.ntUserApi.modifySelfProfile({
      nick: payload.new_nickname,
      longNick: old.baseInfo.longNick,
      sex: old.baseInfo.sex,
      birthday: {
        birthday_year: old.baseInfo.birthday_year,
        birthday_month: old.baseInfo.birthday_month,
        birthday_day: old.baseInfo.birthday_day,
      },
      location: {
        country: '',
        province: '',
        city: '',
        zone: ''
      },
    })
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

const SetBio = defineApi(
  'set_bio',
  SetBioInput,
  z.object({}),
  async (ctx, payload) => {
    const old = (await ctx.ntUserApi.getUserDetailInfoWithBizInfo(selfInfo.uid)).simpleInfo
    const result = await ctx.ntUserApi.modifySelfProfile({
      nick: old.coreInfo.nick,
      longNick: payload.new_bio,
      sex: old.baseInfo.sex,
      birthday: {
        birthday_year: old.baseInfo.birthday_year,
        birthday_month: old.baseInfo.birthday_month,
        birthday_day: old.baseInfo.birthday_day,
      },
      location: {
        country: '',
        province: '',
        city: '',
        zone: ''
      },
    })
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

const GetCustomFaceUrlList = defineApi(
  'get_custom_face_url_list',
  z.object({}),
  GetCustomFaceUrlListOutput,
  async (ctx) => {
    const result = await ctx.ntMsgApi.fetchFavEmojiList(200)
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({
      urls: result.emojiInfoList.map(e => e.url)
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
    if (!cookiesObject.p_skey) {
      const pSkey = (await ctx.ntUserApi.getPSkey([payload.domain])).domainPskeyMap.get(payload.domain)
      if (pSkey) {
        cookiesObject.p_skey = pSkey
      }
    }
    //把获取到的cookiesObject转换成 k=v; 格式字符串拼接在一起
    const cookies = Object.entries(cookiesObject).map(([key, value]) => `${key}=${value}`).join('; ')
    return Ok({ cookies })
  }
)

const GetCSRFToken = defineApi(
  'get_csrf_token',
  z.object({}),
  GetCSRFTokenOutput,
  async (ctx) => {
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
  GetPeerPins,
  SetPeerPin,
  SetAvatar,
  SetNickname,
  SetBio,
  GetCustomFaceUrlList,
  GetCookies,
  GetCSRFToken
]
