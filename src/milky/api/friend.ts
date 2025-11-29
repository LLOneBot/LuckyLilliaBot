import { defineApi, Failed, Ok } from '@/milky/common/api'
import {
  SendFriendNudgeInput,
  SendProfileLikeInput,
  GetFriendRequestsInput,
  GetFriendRequestsOutput,
  AcceptFriendRequestInput,
  RejectFriendRequestInput,
} from '@saltify/milky-types'
import z from 'zod'
import { selfInfo } from '@/common/globalVars'
import { BuddyReqType } from '@/ntqqapi/types'
import { GeneralCallResult } from '@/ntqqapi/services'

export const SendFriendNudge = defineApi(
  'send_friend_nudge',
  SendFriendNudgeInput,
  z.object({}),
  async (ctx, payload) => {
    // Use PMHQ to send friend poke
    await ctx.app.pmhq.sendFriendPoke(payload.user_id)
    return Ok({})
  }
)

export const SendProfileLike = defineApi(
  'send_profile_like',
  SendProfileLikeInput,
  z.object({}),
  async (ctx, payload) => {
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    const result = await ctx.ntUserApi.like(uid, payload.count)
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

export const GetFriendRequests = defineApi(
  'get_friend_requests',
  GetFriendRequestsInput,
  GetFriendRequestsOutput,
  async (ctx, payload) => {
    if (payload.is_filtered) {
      const result = await ctx.ntFriendApi.getDoubtBuddyReq(payload.limit)
      return Ok({
        requests: await Promise.all(result.doubtList.map(async e => {
          return {
            time: Number(e.reqTime),
            initiator_id: Number(await ctx.ntUserApi.getUinByUid(e.uid)),
            initiator_uid: e.uid,
            target_user_id: Number(selfInfo.uin),
            target_user_uid: selfInfo.uid,
            state: 'pending',
            comment: e.msg,
            via: e.source,
            is_filtered: true
          }
        }))
      })
    } else {
      const result = await ctx.ntFriendApi.getBuddyReq()
      let buddyReqs = result.buddyReqs
      if (buddyReqs.length > payload.limit) {
        buddyReqs = buddyReqs.slice(0, payload.limit)
      }
      return Ok({
        requests: await Promise.all(buddyReqs.map(async e => {
          const friendId = Number(await ctx.ntUserApi.getUinByUid(e.friendUid))
          const selfId = Number(selfInfo.uin)
          let via = ''
          if (e.sourceId === 3020) {
            via = 'QQ号查找'
          } else if (e.sourceId === 3004) {
            const groupAll = await ctx.ntGroupApi.getGroupAllInfo(e.groupCode)
            via = `QQ群-${groupAll.groupName}`
          } else if (e.sourceId === 3014) {
            via = '手机号码查找'
          } else if (e.sourceId === 3999) {
            via = '搜索好友'
          } else if (e.sourceId === 3022) {
            via = '推荐联系人'
          } else if (e.sourceId > 10) {
            ctx.logger.info(`via 获取失败, 请反馈, friendId: ${friendId}, sourceId: ${e.sourceId}`)
          }
          return {
            time: Number(e.reqTime),
            initiator_id: e.isInitiator ? selfId : friendId,
            initiator_uid: e.isInitiator ? selfInfo.uid : e.friendUid,
            target_user_id: e.isInitiator ? friendId : selfId,
            target_user_uid: e.isInitiator ? e.friendUid : selfInfo.uid,
            state: ({
              [BuddyReqType.PeerInitiator]: 'pending',
              [BuddyReqType.MeInitiatorWaitPeerConfirm]: 'pending',
              [BuddyReqType.PeerAgreed]: 'accepted',
              [BuddyReqType.MeAgreed]: 'accepted',
              [BuddyReqType.PeerRefused]: 'rejected',
              [BuddyReqType.MeRefused]: 'rejected'
            } as const)[e.reqType as number] ?? 'pending',
            comment: e.extWords,
            via,
            is_filtered: e.isDoubt
          }
        }))
      })
    }
  }
)

export const AcceptFriendRequest = defineApi(
  'accept_friend_request',
  AcceptFriendRequestInput,
  z.object({}),
  async (ctx, payload) => {
    let result: GeneralCallResult
    if (payload.is_filtered) {
      result = await ctx.ntFriendApi.approvalDoubtBuddyReq(payload.initiator_uid)
    } else {
      result = await ctx.ntFriendApi.handleFriendRequest(payload.initiator_uid, '0', true)
    }
    if (result.result !== 0) {
      return Failed(-500, result.errMsg)
    }
    return Ok({})
  }
)

export const RejectFriendRequest = defineApi(
  'reject_friend_request',
  RejectFriendRequestInput,
  z.object({}),
  async (ctx, payload) => {
    if (!payload.is_filtered) {
      const result = await ctx.ntFriendApi.handleFriendRequest(payload.initiator_uid, '0', false)
      if (result.result !== 0) {
        return Failed(-500, result.errMsg)
      }
    }
    return Ok({})
  }
)

export const FriendApi = [
  SendFriendNudge,
  SendProfileLike,
  GetFriendRequests,
  AcceptFriendRequest,
  RejectFriendRequest,
]
