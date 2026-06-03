import { defineApi, Failed, MilkyApiHandler, Ok } from '@/milky/common/api'
import {
  SendFriendNudgeInput,
  SendProfileLikeInput,
  GetFriendRequestsInput,
  GetFriendRequestsOutput,
  AcceptFriendRequestInput,
  RejectFriendRequestInput,
  DeleteFriendInput,
} from '@saltify/milky-types'
import z from 'zod'
import { selfInfo } from '@/common/globalVars'
import { BuddyReqType } from '@/ntqqapi/types'

const SendFriendNudge = defineApi(
  'send_friend_nudge',
  SendFriendNudgeInput,
  z.object({}),
  async (ctx, payload) => {
    const result = await ctx.ntFriendApi.sendFriendNudge(payload.user_id, payload.is_self)
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const SendProfileLike = defineApi(
  'send_profile_like',
  SendProfileLikeInput,
  z.object({}),
  async (ctx, payload) => {
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id)
    if (!uid) {
      return Failed(-404, 'User not found')
    }
    const result = await ctx.ntUserApi.sendProfileLike(uid, payload.count)
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const DeleteFriend = defineApi(
  'delete_friend',
  DeleteFriendInput,
  z.object({}),
  async (ctx, payload) => {
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id)
    if (!uid) {
      return Failed(-404, 'User not found')
    }
    const result = await ctx.ntFriendApi.deleteFriend(uid)
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const GetFriendRequests = defineApi(
  'get_friend_requests',
  GetFriendRequestsInput,
  GetFriendRequestsOutput,
  async (ctx, payload) => {
    if (payload.is_filtered) {
      const result = await ctx.ntFriendApi.getDoubtFriendRequests(payload.limit)
      return Ok({
        requests: await Promise.all(result.map(async e => ({
          time: e.timestamp,
          initiator_id: Number(await ctx.ntUserApi.getUinByUid(e.sourceUid)),
          initiator_uid: e.sourceUid,
          target_user_id: Number(selfInfo.uin),
          target_user_uid: selfInfo.uid,
          state: 'pending',
          comment: e.comment,
          via: e.source,
          is_filtered: true
        })))
      })
    } else {
      const result = await ctx.ntFriendApi.getFriendRequests(payload.limit)
      if (result.errorCode !== 0) {
        return Failed(-500, result.errorMsg)
      }
      return Ok({
        requests: await Promise.all(result.requests.map(async e => {
          const friendId = Number(await ctx.ntUserApi.getUinByUid(e.friendUid))
          const selfId = Number(selfInfo.uin)
          return {
            time: e.timestamp,
            initiator_id: e.isInitiator ? selfId : friendId,
            initiator_uid: e.isInitiator ? selfInfo.uid : e.friendUid,
            target_user_id: e.isInitiator ? friendId : selfId,
            target_user_uid: e.isInitiator ? e.friendUid : selfInfo.uid,
            state: ({
              [BuddyReqType.PeerInitiator]: 'pending',
              [BuddyReqType.MeInitiatorWaitPeerConfirm]: 'pending',
              [BuddyReqType.MeAgreed]: 'accepted',
              [BuddyReqType.MeAgreedAndAdded]: 'accepted',
              [BuddyReqType.PeerAgreed]: 'accepted',
              [BuddyReqType.PeerAgreedAndAdded]: 'accepted',
              [BuddyReqType.PeerRefused]: 'rejected',
              [BuddyReqType.MeRefused]: 'rejected'
            } as const)[e.state] ?? 'pending',
            comment: e.comment,
            via: e.source,
            is_filtered: false
          }
        }))
      })
    }
  }
)

const AcceptFriendRequest = defineApi(
  'accept_friend_request',
  AcceptFriendRequestInput,
  z.object({}),
  async (ctx, payload) => {
    let result
    if (payload.is_filtered) {
      result = await ctx.ntFriendApi.approvalDoubtFriendRequest(payload.initiator_uid)
    } else {
      result = await ctx.ntFriendApi.approvalFriendRequest(payload.initiator_uid, true)
    }
    if (result.errorCode !== 0) {
      return Failed(-500, result.errorMsg)
    }
    return Ok({})
  }
)

const RejectFriendRequest = defineApi(
  'reject_friend_request',
  RejectFriendRequestInput,
  z.object({}),
  async (ctx, payload) => {
    if (!payload.is_filtered) {
      const result = await ctx.ntFriendApi.approvalFriendRequest(payload.initiator_uid, false)
      if (result.errorCode !== 0) {
        return Failed(-500, result.errorMsg)
      }
    }
    return Ok({})
  }
)

export const FriendApi: MilkyApiHandler[] = [
  SendFriendNudge,
  SendProfileLike,
  DeleteFriend,
  GetFriendRequests,
  AcceptFriendRequest,
  RejectFriendRequest,
]
