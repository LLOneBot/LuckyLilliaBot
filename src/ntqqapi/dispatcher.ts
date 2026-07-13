import type { Context } from 'cordis'
import { getLogger } from '@/common/logger'
import { Msg, Notify } from '@/ntqqapi/proto'
import { ChatType, ElementType, RawMessage, GroupNotificationType, RequestState } from '@/ntqqapi/types'
import { selfInfo } from '@/common/globalVars'
import { parseElements } from './helper/messageParsing'
import { InferProtoModel } from '@saltify/typeproto'
import { unzipSync } from 'node:zlib'

const logger = getLogger('dispatcher')

const MSG_PUSH_CMD = 'trpc.msg.olpush.OlPushService.MsgPush'
const KICK_CMD = 'trpc.qq_new_tech.status_svc.StatusService.KickNT'
const INFO_SYNC_PUSH_CMD = 'trpc.msg.register_proxy.RegisterProxy.InfoSyncPush'
const PUSH_PARAMS_CMD = 'trpc.msg.register_proxy.RegisterProxy.PushParams'
const CONFIG_PUSH_CMD = 'ConfigPushSvc.PushReq'

const enum MsgType {
  GroupMessage = 82,
  PrivateMessage = 166,
  PrivateBotMessage = 167,
  TempMessage = 141,
  PrivateRecord = 208,
  PrivateFile = 529,
  GroupMemberIncrease = 33,
  GroupMemberDecrease = 34,
  GroupAdminChange = 44,
  GroupJoinRequest = 84,
  GroupJoined = 85,
  GroupInvitation = 87,
  GroupInvitedJoinRequest = 525,
  Event0x210 = 528,
  Event0x2DC = 732,
}

const enum Event0x210Sub {
  FriendRequest = 35,
  FriendRelatedOrPinChanged = 39,
  PttTransResult = 61,
  FriendRecall = 138,
  FriendSelfRecall = 139,
  FriendAdded = 179,
  GroupRemoved = 212,
  FriendGrayTip = 290,
}

const enum Event0x2DCSub {
  GroupMute = 12,
  GeneralEvent = 16,
  GroupRecall = 17,
  GroupGrayTip = 20,
  GroupEssenceChange = 21,
}

/**
 * 解析 QQ 协议原始 protobuf 推送，emit 对应 cordis 事件。
 * 直连模式和 PMHQ 模式都通过 'qq/raw' 事件喂数据进来。
 */
export function registerDispatcher(ctx: Context) {
  ctx.on('qq/raw', ({ cmd, payload }) => {
    logger.debug(`cmd=${cmd} bodyLen=${payload.length} bodyHex=%h`, payload)
    try {
      switch (cmd) {
        case MSG_PUSH_CMD:
          handleMsgPush(ctx, payload)
          break
        case KICK_CMD:
          handleKickNT(ctx, payload)
          break
        case INFO_SYNC_PUSH_CMD:
          break
        case PUSH_PARAMS_CMD:
          // 多端在线参数推送，业务上不需要处理
          break
        case CONFIG_PUSH_CMD:
          // 服务端配置推送（rkey/highway 配置等），目前不需要主动处理
          break
      }
    } catch (e) {
      ctx.logger.warn('dispatch error:', e)
    }
  })
}

function handleMsgPush(ctx: Context, payload: Buffer) {
  const pushMsg = Msg.PushMsg.decode(payload)
  const msg = pushMsg.message
  logger.debug(`MsgPush msgType=${msg?.contentHead.msgType} subType=${msg?.contentHead.subType} fromUid=${msg?.routingHead?.fromUid ?? '?'} fromUin=${msg?.routingHead?.fromUin ?? '?'} groupCode=${msg?.routingHead?.group?.groupCode ?? '?'}`)
  if (!msg) return

  const msgType = msg.contentHead.msgType
  const subType = msg.contentHead.subType

  switch (msgType) {
    case MsgType.GroupMessage:
    case MsgType.PrivateMessage:
    case MsgType.PrivateBotMessage:
    case MsgType.TempMessage:
    case MsgType.PrivateRecord:
    case MsgType.PrivateFile:
      handleChatMessage(ctx, msg, msgType)
      break

    case MsgType.GroupMemberIncrease:
      handleGroupMemberIncrease(ctx, msg)
      break

    case MsgType.GroupMemberDecrease:
      handleGroupMemberDecrease(ctx, msg)
      break

    case MsgType.GroupAdminChange:
      handleGroupAdminChange(ctx, msg)
      break

    case MsgType.Event0x210:
      handle0x210(ctx, msg, subType)
      break

    case MsgType.Event0x2DC:
      handle0x2DC(ctx, msg, subType)
      break

    case MsgType.GroupJoinRequest:
      handleGroupJoinRequest(ctx, msg)
      break

    case MsgType.GroupInvitation:
    case MsgType.GroupInvitedJoinRequest:
      handleGroupInvitation(ctx, msg, msgType)
      break

    case MsgType.GroupJoined:
      handleGroupJoined(ctx, msg)
      break
  }
}

async function handleGroupAdminChange(ctx: Context, msg: InferProtoModel<typeof Msg.Message>) {
  const content = msg.body?.msgContent
  if (!content) return
  const decoded = Notify.GroupAdminChange.decode(content)
  const adminUid = decoded.isPromote ? decoded.body.extraEnable?.adminUid : decoded.body.extraDisable?.adminUid
  if (!adminUid) return null
  const group = await ctx.ntGroupApi.getGroup(decoded.groupCode, false)
  ctx.parallel('nt/group-admin-changed', {
    groupCode: decoded.groupCode,
    targetUin: await ctx.ntUserApi.getUinByUid(adminUid),
    targetUid: adminUid,
    operatorUin: await ctx.ntUserApi.getUinByUid(group.ownerUid),
    operatorUid: group.ownerUid,
    isSet: decoded.isPromote
  })
}

async function handleGroupMemberDecrease(ctx: Context, msg: InferProtoModel<typeof Msg.Message>) {
  const content = msg.body?.msgContent
  if (!content) return
  const decoded = Notify.GroupMemberChange.decode(content)
  let adminUin
  let adminUid
  if (decoded.adminUid) {
    const adminUidMatch = decoded.adminUid.match(/\x18([^\x18\x10]+)\x10/)
    if (adminUidMatch) {
      adminUid = adminUidMatch[1]
      adminUin = await ctx.ntUserApi.getUinByUid(adminUid)
    }
  }
  if (decoded.type === 129) {
    ctx.parallel('nt/group-disband', {
      groupCode: decoded.groupCode,
      operatorUin: adminUin!,
      operatorUid: adminUid!
    })
  } else {
    ctx.parallel('nt/group-member-removed', {
      groupCode: decoded.groupCode,
      memberUin: await ctx.ntUserApi.getUinByUid(decoded.memberUid),
      memberUid: decoded.memberUid,
      operatorUin: adminUin,
      operatorUid: adminUid
    })
  }
}

async function handleGroupMemberIncrease(ctx: Context, msg: InferProtoModel<typeof Msg.Message>) {
  const content = msg.body?.msgContent
  if (!content) return
  const decoded = Notify.GroupMemberChange.decode(content)
  if (decoded.memberUid === selfInfo.uid && decoded.type === 131) {
    ctx.parallel('nt/group-added', {
      groupCode: decoded.groupCode
    })
  }
  if (decoded.type === 130) {
    ctx.parallel('nt/group-member-added', {
      groupCode: decoded.groupCode,
      memberUin: await ctx.ntUserApi.getUinByUid(decoded.memberUid),
      memberUid: decoded.memberUid,
      operatorUin: await ctx.ntUserApi.getUinByUid(decoded.adminUid),
      operatorUid: decoded.adminUid
    })
  } else if (decoded.type === 131) {
    ctx.parallel('nt/group-member-added', {
      groupCode: decoded.groupCode,
      memberUin: await ctx.ntUserApi.getUinByUid(decoded.memberUid),
      memberUid: decoded.memberUid,
      invitorUin: await ctx.ntUserApi.getUinByUid(decoded.adminUid),
      invitorUid: decoded.adminUid
    })
  }
}

function handleGroupJoined(ctx: Context, msg: InferProtoModel<typeof Msg.Message>) {
  const content = msg.body?.msgContent
  if (!content) return
  const decoded = Notify.GroupJoined.decode(content)
  ctx.parallel('nt/group-added', {
    groupCode: decoded.groupCode
  })
}

/** 解析 KickNT 被踢下线推送 */
function handleKickNT(ctx: Context, payload: Buffer) {
  const decoded = Msg.KickNTPush.decode(payload)
  selfInfo.online = false
  const why = decoded.code === 1001 ? '异地登录顶号' : decoded.code === 2001 ? '服务端主动踢出' : '未知'
  ctx.logger.warn(`[Kick] code=${decoded.code} (${why}) title="${decoded.tipsTitle}" desc="${decoded.tipsDesc}"`)
  ctx.parallel('nt/kicked-offline', {
    tipsDesc: decoded.tipsDesc,
    tipsTitle: decoded.tipsTitle,
    kickedType: decoded.code
  })
}

function handle0x210(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, subType: number) {
  const content = msg.body?.msgContent
  if (!content) return

  switch (subType) {
    case Event0x210Sub.FriendRequest:
      handleFriendRequest(ctx, msg, content)
      break

    case Event0x210Sub.FriendRecall:
    case Event0x210Sub.FriendSelfRecall:
      handleFriendRecall(ctx, content)
      break

    case Event0x210Sub.FriendRelatedOrPinChanged:
      handleFriendRelatedOrPin(ctx, msg, content)
      break

    case Event0x210Sub.FriendGrayTip:
      handleFriendGrayTip(ctx, msg, content)
      break

    case Event0x210Sub.PttTransResult:
      handlePttTransResult(ctx, content)
      break

    case Event0x210Sub.GroupRemoved:
      handleGroupRemoved(ctx, content)
      break

    case Event0x210Sub.FriendAdded:
      handleFriendAdded(ctx, msg, content)
      break
  }
}

function handleFriendAdded(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, content: Buffer) {
  const decoded = Notify.FriendAdded.decode(content)
  ctx.parallel('nt/friend-added', {
    uin: msg.routingHead.fromUin,
    uid: decoded.body.friendUid
  })
}

function handleGroupRemoved(ctx: Context, content: Buffer) {
  const decoded = Notify.GroupRemoved.decode(content)
  ctx.parallel('nt/group-removed', decoded)
}

async function handleFriendRelatedOrPin(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, content: Buffer) {
  try {
    const decoded = Notify.FriendRelatedOrPinChange.decode(content)
    if (decoded.body.friendDeleted) {
      const { uid } = decoded.body.friendDeleted
      ctx.parallel('nt/friend-removed', {
        uin: await ctx.ntUserApi.getUinByUid(uid),
        uid
      })
    } else if (decoded.body.pinChanged) {
      const { body } = decoded.body.pinChanged
      ctx.parallel('nt/pin-changed', {
        chatType: body.groupCode ? ChatType.Group : ChatType.C2C,
        peerUin: body.groupCode ?? await ctx.ntUserApi.getUinByUid(body.uid),
        peerUid: body.groupCode ? body.groupCode.toString() : body.uid,
        isPinned: body.info.timestamp.length !== 0
      })
    } else if (decoded.body.profileLike) {
      const { msg } = decoded.body.profileLike
      ctx.parallel('nt/profile-like', {
        uin: msg.detail.uin,
        uid: await ctx.ntUserApi.getUidByUin(msg.detail.uin),
        nick: msg.detail.nickname,
        times: Number(msg.detail.txt?.match(/\d+/)?.[0] ?? 0)
      })
    }
  } catch (e) {
    ctx.logger.warn('FriendRelatedOrPin parse error:', (e as Error).message)
  }
}

function handleFriendGrayTip(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, content: Buffer) {
  try {
    const decoded = Notify.GeneralGrayTip.decode(content)
    if (decoded.bizType === 12) {
      ctx.parallel('nt/friend-nudge', {
        uin: msg.routingHead.fromUin,
        uid: msg.routingHead.fromUid,
        isSelfSend: decoded.templParam.get('uin_str1') === selfInfo.uin,
        isSelfReceive: decoded.templParam.get('uin_str2') === selfInfo.uin,
        displayAction: decoded.templParam.get('action_str')!,
        displaySuffix: decoded.templParam.get('suffix_str')!,
        displayActionImgUrl: decoded.templParam.get('action_img_url')!
      })
    }
  } catch (e) {
    ctx.logger.warn('FriendGrayTip parse error:', (e as Error).message)
  }
}

function handlePttTransResult(ctx: Context, content: Buffer) {
  try {
    const decoded = Msg.PttTransResultPush.decode(content)
    const body = decoded.body
    if (!body) return
    ctx.parallel('nt/ptt-trans-result', {
      msgId: body.msgUid.toString(),
      text: body.text,
    })
  } catch (e) {
    ctx.logger.warn('PttTransResult parse error:', (e as Error).message)
  }
}

function handleFriendRequest(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, content: Buffer) {
  const decoded = Notify.FriendRequest.decode(content)
  if (!decoded.body) return
  ctx.parallel('nt/friend-request', {
    initiatorUin: msg.routingHead.fromUin,
    initiatorUid: decoded.body.fromUid,
    comment: decoded.body.message,
    via: decoded.body.via
  })
}

async function handleFriendRecall(ctx: Context, content: Buffer) {
  try {
    const decoded = Notify.FriendRecall.decode(content)
    const body = decoded.body
    if (!body) return

    const fromUid = body.fromUid
    const toUid = body.toUid
    const fromUin = await ctx.ntUserApi.getUinByUid(fromUid)
    const toUin = await ctx.ntUserApi.getUinByUid(toUid)
    // 在 C2C 会话里，peerUid 是"对话另一端"。
    // - bot 收到对方撤回：body.fromUid=对方, body.toUid=自己 → peerUid=fromUid
    // - bot 自己撤回时 server 会回声同一条 push：body.fromUid=自己, body.toUid=对方 → peerUid=toUid
    const peerUid = fromUid === selfInfo.uid ? toUid : fromUid
    const peerUin = fromUid === selfInfo.uid ? toUin : fromUin

    ctx.parallel('nt/message-deleted', {
      chatType: await ctx.ntFriendApi.isFriend(peerUid) ? ChatType.C2C : ChatType.TempC2CFromGroup,
      peerUin,
      peerUid,
      msgId: body.msgUid.toString(),
      msgSeq: body.sequence,
      msgRandom: body.random,
      senderUin: fromUin,
      senderUid: fromUid,
      operatorUin: fromUin,
      operatorUid: fromUid,
      displaySuffix: body.tipInfo?.tip ?? ''
    })
  } catch (e) {
    ctx.logger.warn('Failed to parse FriendRecall:', (e as Error).message)
  }
}

// ---- MsgType 732 (Event0x2DC) - Group events ----

function handle0x2DC(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, subType: number) {
  const content = msg.body?.msgContent
  if (!content) return

  switch (subType) {
    case Event0x2DCSub.GroupRecall:
      handleGroupRecall(ctx, content)
      break

    case Event0x2DCSub.GroupMute:
      handleGroupMute(ctx, content)
      break

    case Event0x2DCSub.GeneralEvent:
      // 16: contains nested NotifyMessageBody with subType=35 (reactions), 12 (group name change), etc.
      handleGroupGeneralEvent(ctx, content)
      break

    case Event0x2DCSub.GroupGrayTip:
      handleGroupGrayTip(ctx, msg, content)
      break

    case Event0x2DCSub.GroupEssenceChange:
      handleGroupEssenceChange(ctx, content)
      break
  }
}

async function handleGroupMute(ctx: Context, content: Buffer) {
  try {
    // GroupMute (0x2DC subType=12) 的 msgContent 直接是 GroupMute proto，
    // 不像 subType=16/20/21 那样有 [4B groupUin + 1B + 2B len] TLV 包头。
    // 老代码错误地走 unwrap0x2DCContent，导致 field 1 (groupCode) 解出来是错的内部 ID。
    const decoded = Notify.GroupMute.decode(content)
    const { state } = decoded.info

    if (state.targetUid) {
      ctx.parallel('nt/group-mute', {
        groupCode: decoded.groupCode,
        memberUin: await ctx.ntUserApi.getUinByUid(state.targetUid),
        memberUid: state.targetUid,
        operatorUin: await ctx.ntUserApi.getUinByUid(decoded.operatorUid),
        operatorUid: decoded.operatorUid,
        duration: state.duration
      })
    } else {
      ctx.parallel('nt/group-whole-mute', {
        groupCode: decoded.groupCode,
        operatorUin: await ctx.ntUserApi.getUinByUid(decoded.operatorUid),
        operatorUid: decoded.operatorUid,
        isMute: state.duration !== 0
      })
    }
  } catch (e) {
    ctx.logger.warn('GroupMute parse error:', (e as Error).message)
  }
}

async function handleGroupGeneralEvent(ctx: Context, content: Buffer) {
  try {
    if (content.length < 7) return
    // 实测 reaction 推送 (subType=16+field13=35) 有 TLV 头。
    const groupUinFromTLV = content.readUInt32BE(0)
    const inner = unwrap0x2DCContent(content)
    const notifyBody = Notify.NotifyMessageBody.decode(inner)
    const groupCode = notifyBody.groupCode || groupUinFromTLV
    // 0x2DC subType=16 通过 field13 区分子事件：
    //   6 = GroupMemberSpecialTitle, 12 = GroupNameChange, 23 = GroupTodo, 35 = GroupReaction
    const field13 = notifyBody.subType ?? 0
    if (field13 === 35) {
      const { data } = notifyBody.reaction!.data
      ctx.parallel('nt/group-message-reaction', {
        groupCode,
        operatorUin: await ctx.ntUserApi.getUinByUid(data.data.operatorUid),
        operatorUid: data.data.operatorUid,
        msgSeq: data.target.sequence,
        faceId: data.data.code,
        count: data.data.count,
        type: data.data.reactionType,
        isAdd: data.data.actionType === 1
      })
    } else if (field13 === 6) {
      // 群成员获得头衔（GroupMemberSpecialTitle）。eventParam (field 5) 是一个 proto，
      // 内部 field 2 是带 JSON 模板的灰条文字，形如：
      //   恭喜<{"cmd":5,"data":"<uin>","text":"<nick>"}>获得群主授予的<{"cmd":1,"text":"<title>",...}>头衔
      const eventParam = notifyBody.eventParam
      if (!eventParam) return
      const decoded = Notify.GroupMemberSpecialTitleChange.decode(eventParam)
      // cmd=5 是用户引用，data 是 uin；cmd=1 是带链接的文本，text 是真正的头衔
      const titleMatch = decoded.tipText.match(/\{"cmd":1,[^}]*?"text":"([^"]+)"/)
      const title = titleMatch?.[1] ?? ''
      ctx.parallel('nt/group-member-special-title-changed', {
        groupCode,
        uin: decoded.memberUin,
        uid: await ctx.ntUserApi.getUidByUin(decoded.memberUin, groupCode),
        newSpecialTitle: title
      })
    } else if (field13 === 12) {
      // GroupNameChange：eventParam 是 GroupNameChangeBody（field 1=1, field 2=新群名）。
      // operatorUid 在 NotifyMessageBody.field 21 (notifyBody.operatorUid)。
      const eventParam = notifyBody.eventParam
      if (!eventParam || !notifyBody.operatorUid) return
      const body = Notify.GroupNameChangeBody.decode(eventParam)
      ctx.parallel('nt/group-name-changed', {
        groupCode,
        newGroupName: body.newName,
        operatorUin: await ctx.ntUserApi.getUinByUid(notifyBody.operatorUid),
        operatorUid: notifyBody.operatorUid
      })
    }
  } catch (e) {
    ctx.logger.warn('GroupGeneralEvent parse error:', (e as Error).message)
  }
}

async function handleGroupGrayTip(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, content: Buffer) {
  try {
    if (content.length < 7) return
    const groupUinFromTLV = content.readUInt32BE(0)
    const inner = unwrap0x2DCContent(content)
    if (!inner) return
    const notifyBody = Notify.NotifyMessageBody.decode(inner)
    const grayTip = notifyBody.generalGrayTip
    if (!grayTip) return
    // 优先用 NotifyMessageBody.groupCode (field 4)，fallback 用 TLV 头 4 字节
    const groupCode = notifyBody.groupCode || groupUinFromTLV
    if (grayTip.bizType === 12) {
      const uin1 = +grayTip.templParam.get('uin_str1')!
      const uin2 = +grayTip.templParam.get('uin_str2')!
      ctx.parallel('nt/group-nudge', {
        groupCode,
        senderUin: uin1,
        senderUid: await ctx.ntUserApi.getUidByUin(uin1, groupCode),
        receiverUin: uin2,
        receiverUid: await ctx.ntUserApi.getUidByUin(uin2, groupCode),
        displayAction: grayTip.templParam.get('action_str')!,
        displaySuffix: grayTip.templParam.get('suffix_str')!,
        displayActionImgUrl: grayTip.templParam.get('action_img_url')!
      })
    }
  } catch (e) {
    ctx.logger.warn('GroupGrayTip parse error:', (e as Error).message)
  }
}

async function handleGroupEssenceChange(ctx: Context, content: Buffer) {
  try {
    if (content.length < 7) return
    const groupUin = content.readUInt32BE(0)
    const inner = unwrap0x2DCContent(content)
    if (!inner) return
    // 0x2DC 内层是 NotifyMessageBody 结构，groupUin 在 field 4，typed event 在 field 33
    const notifyBody = Notify.NotifyMessageBody.decode(inner)
    const groupCode = notifyBody.groupCode || groupUin
    const info = notifyBody.essenceMessage!
    ctx.parallel('nt/group-essence-message-changed', {
      groupCode,
      msgId: String((0x01000000n << 32n) | BigInt(info.random)),
      msgSeq: info.msgSequence,
      msgRandom: info.random,
      senderUin: info.memberUin,
      senderUid: await ctx.ntUserApi.getUidByUin(info.memberUin, groupCode),
      operatorUin: info.operatorUin,
      operatorUid: await ctx.ntUserApi.getUidByUin(info.operatorUin, groupCode),
      isSet: info.setFlag === 1
    })
  } catch (e) {
    ctx.logger.warn('GroupEssenceChange parse error:', (e as Error).message)
  }
}

/**
 * Strip the leading [4 bytes group code + 1 byte unknown + length-prefix] from 0x2DC content.
 * Returns the inner protobuf body.
 */
function unwrap0x2DCContent(content: Buffer) {
  // 0x2DC content: [4 bytes BE: groupUin][1 byte: ?][2 bytes BE: length][NotifyMessageBody bytes]
  const length = content.readUInt16BE(5)
  return content.subarray(7, 7 + length)
}

/**
 * 0x2DC subtype 17 - Group recall
 * Content layout: [4 bytes BE: groupUin][1 byte: ?][2 bytes BE length][NotifyMessageBody bytes]
 * NotifyMessageBody.field11 = GroupRecall (with repeated RecallMessages at field 3)
 */
async function handleGroupRecall(ctx: Context, content: Buffer) {
  try {
    if (content.length < 7) return
    const groupCode = content.readUInt32BE(0)
    // skip 4 bytes groupUin + 1 byte flag, then uint16 BE length-prefixed NotifyMessageBody
    const length = content.readUInt16BE(5)
    const bodyBytes = content.subarray(7, 7 + length)

    const notifyBody = Notify.NotifyMessageBody.decode(bodyBytes)
    const recall = notifyBody.recall
    if (!recall || !recall.recallMessages || recall.recallMessages.length === 0) return

    const operatorUid = recall.operatorUid || notifyBody.operatorUid || ''
    const operatorUin = await ctx.ntUserApi.getUinByUid(operatorUid)

    for (const rm of recall.recallMessages) {
      ctx.parallel('nt/message-deleted', {
        chatType: ChatType.Group,
        peerUin: groupCode,
        peerUid: groupCode.toString(),
        msgId: String((0x01000000n << 32n) | BigInt(rm.random)),
        msgSeq: rm.sequence,
        msgRandom: rm.random,
        senderUin: await ctx.ntUserApi.getUinByUid(rm.authorUid),
        senderUid: rm.authorUid,
        operatorUin,
        operatorUid,
        displaySuffix: recall.tipInfo?.tip ?? ''
      })
    }
  } catch (e) {
    ctx.logger.warn('Failed to parse GroupRecall:', (e as Error).message)
  }
}

// ---- Group join / invite ----

async function handleGroupJoinRequest(ctx: Context, msg: InferProtoModel<typeof Msg.Message>) {
  // MsgType 84: 入群申请通知
  try {
    if (!msg.body) return
    const decoded = Notify.GroupJoinRequest.decode(msg.body.msgContent)
    let notificationSeq, commit
    let isDoubt = false
    const res = await ctx.ntGroupApi.getGroupNotifications(false, 20)
    const notification = res.notifications
      .filter(e => e.type === GroupNotificationType.JoinRequest)
      .find(e => e.group.groupCode === decoded.groupCode
        && e.user1.uid === decoded.memberUid
        && e.requestState === RequestState.Unhandle
      )
    if (notification) {
      notificationSeq = notification.sequence
      commit = notification.comment
    } else {
      const res = await ctx.ntGroupApi.getGroupNotifications(true, 10)
      const notification = res.notifications
        .filter(e => e.type === GroupNotificationType.JoinRequest)
        .find(e => e.group.groupCode === decoded.groupCode
          && e.user1.uid === decoded.memberUid
          && e.requestState === RequestState.Unhandle
        )
      if (notification) {
        isDoubt = true
        notificationSeq = notification.sequence
        commit = notification.comment
      }
    }
    if (notificationSeq) {
      ctx.parallel('nt/group-join-request', {
        groupCode: decoded.groupCode,
        initiatorUin: await ctx.ntUserApi.getUinByUid(decoded.memberUid),
        initiatorUid: decoded.memberUid,
        notificationSeq,
        isDoubt,
        comment: commit ?? ''
      })
    }
  } catch (e) {
    ctx.logger.warn('Failed to parse GroupJoinRequest:', (e as Error).message)
  }
}

async function handleGroupInvitation(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, msgType: number) {
  try {
    if (!msg.body) return
    const content = msg.body.msgContent
    if (msgType === MsgType.GroupInvitedJoinRequest) {
      const decoded = Notify.GroupInvitedJoinRequest.decode(content)
      const { inner } = decoded.info
      const res = await ctx.ntGroupApi.getGroupNotifications(false, 20)
      const notification = res.notifications
        .filter(e => e.type === GroupNotificationType.InvitedJoinRequest)
        .find(e => e.group.groupCode === inner.groupCode
          && e.user2!.uid === inner.invitorUid
          && e.user1.uid === inner.targetUid
          && e.requestState === RequestState.Unhandle
        )
      if (notification) {
        ctx.parallel('nt/group-invited-join-request', {
          groupCode: inner.groupCode,
          initiatorUin: await ctx.ntUserApi.getUinByUid(inner.invitorUid),
          initiatorUid: inner.invitorUid,
          targetUserUin: await ctx.ntUserApi.getUinByUid(inner.targetUid),
          targetUserUid: inner.targetUid,
          notificationSeq: notification.sequence
        })
      }
    } else {
      const decoded = Notify.GroupInvitation.decode(content)
      const res = await ctx.ntGroupApi.getGroupNotifications(false, 20)
      const notification = res.notifications
        .filter(e => e.type === GroupNotificationType.Invitation)
        .find(e => e.group.groupCode === decoded.groupCode
          && e.user2!.uid === decoded.invitorUid
          && e.requestState === RequestState.Unhandle
        )
      if (notification) {
        ctx.parallel('nt/group-invitation', {
          groupCode: decoded.groupCode,
          initiatorUin: await ctx.ntUserApi.getUinByUid(decoded.invitorUid),
          initiatorUid: decoded.invitorUid,
          invitationSeq: notification.sequence
        })
      }
    }
  } catch (e) {
    ctx.logger.warn('Failed to parse GroupInvitation:', (e as Error).message)
  }
}

function handleChatMessage(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, msgType: number) {
  const routingHead = msg.routingHead
  ctx.store.addUix([{
    uid: routingHead.fromUid,
    uin: routingHead.fromUin
  }]).catch(e => ctx.logger.warn(e))
  if (msgType === MsgType.TempMessage) {
    let peerUid
    if (routingHead.fromUid === selfInfo.uid && routingHead.toUid) {
      peerUid = routingHead.toUid
    } else {
      peerUid = routingHead.fromUid
    }
    ctx.store.addTempChatInfo({
      peerUid,
      groupCode: routingHead.c2c.fromTinyId
    }).catch(e => ctx.logger.warn(e))
  } else if (msgType === MsgType.PrivateMessage) {
    if (msg.body?.richText.elems[0]?.lightApp) {
      const { data } = msg.body.richText.elems[0].lightApp
      const json = unzipSync(data.subarray(1)).toString()
      const regex = /(?=.*?"app"\s*:\s*"com\.tencent\.tuwen\.lua")(?=.*?"bizsrc"\s*:\s*"qun\.invite")[\s\S]*?"jumpUrl"\s*:\s*"([^"]*)"/
      const jumpUrlMatch = json.match(regex)
      if (jumpUrlMatch?.[1]) {
        const params = new URLSearchParams(jumpUrlMatch[1])
        const receiverUin = params.get('receiveruin')
        const senderUin = params.get('senderuin')
        const msgFromUin = msg.routingHead.fromUin.toString()
        if (receiverUin === selfInfo.uin && senderUin === msgFromUin) {
          const groupCode = params.get('groupcode')!
          const seq = params.get('msgseq')!
          ctx.parallel('nt/group-invitation', {
            groupCode: +groupCode,
            initiatorUin: msg.routingHead.fromUin,
            initiatorUid: msg.routingHead.fromUid,
            invitationSeq: +seq
          })
        }
      }
    }
  } else if (msgType === MsgType.GroupMessage) {
    const peerUin = routingHead.group.groupCode
    const senderUin = routingHead.fromUin
    const senderUid = routingHead.fromUid
    const sendMemberName = routingHead.group.groupCardType === 1 ?
      routingHead.group.groupCard : ''
    ctx.store.getGroupMemberCardName(peerUin, senderUin).then(oldCard => {
      if (oldCard === undefined) {
        ctx.store.setGroupMemberCardName(peerUin, senderUin, sendMemberName)
          .catch(e => ctx.logger.warn(e))
      } else {
        if (oldCard !== sendMemberName) {
          ctx.store.setGroupMemberCardName(peerUin, senderUin, sendMemberName)
            .catch(e => ctx.logger.warn(e))
          ctx.parallel('nt/group-member-card-name-changed', {
            groupCode: peerUin,
            uin: senderUin,
            uid: senderUid,
            oldCardName: oldCard,
            newCardName: sendMemberName
          })
        }
      }
    }).catch(e => ctx.logger.warn(e))
  }
  const rawMessage = convertToRawMessage(msg)
  if (!rawMessage) return
  {
    const elemSummary = rawMessage.elements.map(e => `type=${e.elementType}` + (e.fileElement ? ` file=${e.fileElement.fileName}` : '') + (e.textElement ? ` text="${e.textElement.content?.slice(0, 30)}"` : '')).join(', ')
    logger.debug(`convertedRawMsg msgId=${rawMessage.msgId} chatType=${rawMessage.chatType} peerUin=${rawMessage.peerUin} senderUin=${rawMessage.senderUin} elementsLen=${rawMessage.elements.length} [${elemSummary}]`)
  }
  const isSelfMsg = rawMessage.senderUin === +selfInfo.uin
  if (isSelfMsg) {
    logger.debug(`emit nt/message-sent msgId=${rawMessage.msgId}`)
    ctx.parallel('nt/message-sent', { message: rawMessage })
    return
  }
  ctx.parallel('nt/message-created', { message: rawMessage })
}

/** 把 Msg.Message protobuf 转换为上层用的 RawMessage（OlPush 推送和 SsoGetGroupMsg 拉历史共用） */
export function convertToRawMessage(msg: InferProtoModel<typeof Msg.Message>): RawMessage | null {
  const routingHead = msg.routingHead
  const contentHead = msg.contentHead
  const body = msg.body
  const msgType = contentHead.msgType

  if (!routingHead || !contentHead) return null
  if (!routingHead.fromUin) return null // 已删除的消息没有它

  let chatType: ChatType
  let peerUin: number
  let peerUid: string
  let sendMemberName = ''
  let sendNickName = ''
  let peerName = ''
  let tempFromGroupCode = 0

  if (msgType === MsgType.GroupMessage) {
    chatType = ChatType.Group
    peerUin = routingHead.group.groupCode
    peerUid = peerUin.toString()
    if (routingHead.group.groupCardType === 1) {
      sendMemberName = routingHead.group.groupCard
    } else {
      sendNickName = routingHead.group.groupCard
    }
    peerName = routingHead.group.groupName
  } else if (msgType === MsgType.TempMessage) {
    chatType = ChatType.TempC2CFromGroup
    // 对话另一端：自己发的消息 server 回声里 fromUid=自己，要用 toUid 当 peer
    if (routingHead.fromUid === selfInfo.uid && routingHead.toUid) {
      peerUin = routingHead.toUin
      peerUid = routingHead.toUid
    } else {
      peerUin = routingHead.fromUin
      peerUid = routingHead.fromUid
    }
    tempFromGroupCode = routingHead.c2c.fromTinyId
    sendNickName = routingHead.c2c.name // 似乎只在合并转发中存在
  } else {
    chatType = ChatType.C2C
    if (routingHead.fromUid === selfInfo.uid && routingHead.toUid) {
      peerUin = routingHead.toUin
      peerUid = routingHead.toUid
    } else {
      peerUin = routingHead.fromUin
      peerUid = routingHead.fromUid
    }
    sendNickName = routingHead.c2c.name // 似乎只在合并转发中存在
  }

  const elements = parseElements(body?.richText?.elems || [], chatType === ChatType.Group)

  // C2C 离线文件（trans 0x211 + msgType=PrivateFile）：内容在 body.msgContent 而不是 richText.elems
  if (msgType === MsgType.PrivateFile && body?.msgContent && elements.length === 0) {
    try {
      const fe = Msg.FileExtra.decode(Buffer.from(body.msgContent))
      const nof = fe.file
      if (nof) {
        elements.push({
          elementType: ElementType.File,
          fileElement: {
            fileName: nof.fileName,
            fileSize: nof.fileSize,
            fileMd5: nof.fileMd5 ? Buffer.from(nof.fileMd5).toString('hex') : '',
            expireTime: nof.expireTime,
            fileUuid: nof.fileUuid,
            fileBizId: 0,
            filePath: '',
            folderId: ''
          },
        })
      }
    } catch (e) {
      logger.warn('PrivateFile FileExtra decode failed:', (e as Error).message)
    }
  }

  return {
    msgId: String(contentHead.msgUid || ((0x01000000n << 32n) | BigInt(contentHead.random))),
    msgTime: contentHead.msgTime,
    // 取"双端一致的 server seq"：群聊用 contentHead.groupMsgSeqOrC2cClientSeq (field 5)；
    // 私聊用 contentHead.c2cMsgSeq (field 11)，私聊时它非空，群聊时它为 0 走 fallback。
    msgSeq: contentHead.c2cMsgSeq || contentHead.groupMsgSeqOrC2cClientSeq,
    msgRandom: contentHead.random,
    senderUid: routingHead.fromUid,
    senderUin: routingHead.fromUin,
    peerUid,
    peerUin,
    sendNickName,
    sendMemberName,
    chatType,
    elements,
    peerName,
    tempFromGroupCode,
    // 私聊时 RawMessage.clientSeq = contentHead.groupMsgSeqOrC2cClientSeq (field 5)
    //   = 发送方 PbSendMsg 时提交的 client `clientSequence` (10000-99999 临时号)，
    //     server 原样转发到接收方。撤回（SsoC2CRecallMsg.info.clientSequence f1）和
    //     reply（srcMsg.origSeqs[0]）都用它定位被引用的 c2c 消息。
    // 群聊时此字段无意义，置 0。
    clientSeq: contentHead.c2cMsgSeq ? contentHead.groupMsgSeqOrC2cClientSeq : 0,
    forwardAvatar: contentHead.forward?.avatar ?? ''
  }
}
