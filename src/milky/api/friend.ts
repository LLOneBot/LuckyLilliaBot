import { defineApi, Failed, Ok } from '@/milky/common/api'
import {
  SendFriendNudgeInput,
  SendProfileLikeInput,
  GetFriendRequestsInput,
  GetFriendRequestsOutput,
  AcceptFriendRequestInput,
  RejectFriendRequestInput,
} from '@saltify/milky-types'
import { transformFriendRequest } from '@/milky/transform/notification'
import z from 'zod'

export const SendFriendNudge = defineApi(
  'send_friend_nudge',
  SendFriendNudgeInput,
  z.object({}),
  async (ctx, payload) => {
    // Use PMHQ to send friend poke
    try {
      await ctx.app.pmhq.sendFriendPoke(payload.user_id)
      return Ok({})
    } catch (error) {
      ctx.logger.error('Failed to send friend nudge:', error)
      return Failed(-500, 'Failed to send friend nudge')
    }
  }
)

export const SendProfileLike = defineApi(
  'send_profile_like',
  SendProfileLikeInput,
  z.object({}),
  async (ctx, payload) => {
    await ctx.ntUserApi.like(payload.user_id.toString(), payload.count)
    return Ok({})
  }
)

export const GetFriendRequests = defineApi(
  'get_friend_requests',
  GetFriendRequestsInput,
  GetFriendRequestsOutput,
  async (ctx, payload) => {
    // NTQQ doesn't have a direct getBuddyReq API, return empty for now
    return Ok({
      requests: [],
    })
  }
)

export const AcceptFriendRequest = defineApi(
  'accept_friend_request',
  AcceptFriendRequestInput,
  z.object({}),
  async (ctx, payload) => {
    // handleFriendRequest requires friendUid, reqTime, and accept flag
    // We need the reqTime which should be stored with the request
    await ctx.ntFriendApi.handleFriendRequest(payload.initiator_uid, '0', true)
    return Ok({})
  }
)

export const RejectFriendRequest = defineApi(
  'reject_friend_request',
  RejectFriendRequestInput,
  z.object({}),
  async (ctx, payload) => {
    await ctx.ntFriendApi.handleFriendRequest(payload.initiator_uid, '0', false)
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
