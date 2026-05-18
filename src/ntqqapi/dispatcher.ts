import { Msg, Notify, Media } from '@/ntqqapi/proto'
import { ChatType, ElementType, RawMessage, MessageElement, GrayTipElementSubType, GroupNotify, GroupNotifyType, GroupNotifyStatus, FriendRequestNotify, BuddyReqType } from '@/ntqqapi/types'
import type { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { unzipSync } from 'node:zlib'

const MSG_PUSH_CMD = 'trpc.msg.olpush.OlPushService.MsgPush'
const KICK_CMD = 'trpc.qq_new_tech.status_svc.StatusService.KickNT'
const INFO_SYNC_PUSH_CMD = 'trpc.msg.register_proxy.RegisterProxy.InfoSyncPush'
const PUSH_PARAMS_CMD = 'trpc.msg.register_proxy.RegisterProxy.PushParams'
const CONFIG_PUSH_CMD = 'ConfigPushSvc.PushReq'

const enum MsgType {
  GroupMessage = 82,
  PrivateMessage = 166,
  TempMessage = 141,
  PrivateRecord = 208,
  PrivateFile = 529,
  GroupMemberIncrease = 33,
  GroupMemberDecrease = 34,
  GroupAdminChange = 44,
  GroupJoinRequest = 84,
  GroupInvitation = 87,
  Event0x20D = 525,
  Event0x210 = 528,
  Event0x2DC = 732,
}

const enum Event0x210Sub {
  FriendRequest = 35,
  FriendDeleteOrPinChanged = 39,
  FriendRecall = 138,
  FriendSelfRecall = 139,
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
    try {
      switch (cmd) {
        case MSG_PUSH_CMD:
          handleMsgPush(ctx, payload)
          break
        case KICK_CMD:
          ctx.parallel('nt/kicked-offLine', { tipsTitle: 'KickNT', tipsDesc: 'Kicked by server' } as any)
          break
        case INFO_SYNC_PUSH_CMD:
          // 离线消息/群同步推送，目前已通过其他途径上线，先忽略
          break
        case PUSH_PARAMS_CMD:
          // 多端在线参数推送，业务上不需要处理
          break
        case CONFIG_PUSH_CMD:
          // 服务端配置推送（rkey/highway 配置等），目前不需要主动处理
          break
      }
    } catch (e) {
      ctx.logger('qqProtocol').warn('dispatch error:', (e as Error).message)
    }
  })
}

function handleMsgPush(ctx: Context, payload: Buffer) {
  const pushMsg = Msg.PushMsg.decode(payload)
  const msg = pushMsg.message
  if (!msg) return

  const msgType = msg.contentHead.msgType
  const subType = msg.contentHead.subType

  switch (msgType) {
    case MsgType.GroupMessage:
    case MsgType.PrivateMessage:
    case MsgType.TempMessage:
    case MsgType.PrivateRecord:
    case MsgType.PrivateFile:
      handleChatMessage(ctx, msg, msgType)
      break

    case MsgType.GroupMemberIncrease:
    case MsgType.GroupMemberDecrease:
    case MsgType.GroupAdminChange:
      // Forward to OB11 adapter which already handles these via Msg.Message.decode
      forwardSystemMessage(ctx, msg)
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
    case MsgType.Event0x20D:
      handleGroupInvitation(ctx, msg, msgType)
      break
  }
}

function forwardSystemMessage(ctx: Context, msg: any) {
  const messageBytes = Msg.Message.encode(msg)
  ctx.parallel('nt/system-message-created', Buffer.from(messageBytes))
}

// ---- MsgType 528 (Event0x210) - Friend events ----

function handle0x210(ctx: Context, msg: any, subType: number) {
  const content = msg.body?.msgContent
  if (!content) return

  switch (subType) {
    case Event0x210Sub.FriendRequest:
      handleFriendRequest(ctx, msg, content)
      break

    case Event0x210Sub.FriendRecall:
    case Event0x210Sub.FriendSelfRecall:
      handleFriendRecall(ctx, msg, content)
      break

    case Event0x210Sub.FriendDeleteOrPinChanged:
      handleFriendDeleteOrPin(ctx, content)
      break

    case Event0x210Sub.FriendGrayTip:
      handleFriendGrayTip(ctx, content)
      break

    default:
      forwardSystemMessage(ctx, msg)
      break
  }
}

function handleFriendDeleteOrPin(ctx: Context, content: Buffer) {
  try {
    const decoded: any = Notify.FriendDeleteOrPinChange.decode(content)
    const pinChanged = decoded.body?.pinChanged
    if (pinChanged) {
      const uid = pinChanged.body?.uid || ''
      ctx.parallel('nt/raw/friend-pin-changed', { uid, isPinned: true })
    } else {
      // Profile like or other; forward as is
      ctx.parallel('nt/system-message-created', content)
    }
  } catch (e) {
    ctx.logger('qqProtocol').warn('FriendDeleteOrPin parse error:', (e as Error).message)
  }
}

function handleFriendGrayTip(ctx: Context, content: Buffer) {
  try {
    const decoded: any = Notify.GeneralGrayTip.decode(content)
    if (decoded.bizType === 12) {
      const params: Record<string, string> = {}
      for (const p of decoded.templateParams || []) {
        params[p.key] = p.value
      }
      ctx.parallel('nt/raw/friend-poke', {
        fromUin: params['uin_str2'] || '0',
        toUin: params['uin_str1'] || '0',
        action: params['action_str'] || params['alt_str1'] || '',
        suffix: params['suffix_str'] || '',
        actionImg: params['action_img_url'] || '',
      })
    }
  } catch (e) {
    ctx.logger('qqProtocol').warn('FriendGrayTip parse error:', (e as Error).message)
  }
}

function handleFriendRequest(ctx: Context, msg: any, content: Buffer) {
  try {
    const decoded = Notify.FriendRequest.decode(content)
    const fromUid = decoded.body?.fromUid || ''
    const fromUin = msg.routingHead?.fromUin || 0
    const message = decoded.body?.message || ''

    const notify: FriendRequestNotify = {
      unreadNums: 1,
      buddyReqs: [{
        isDecide: false,
        isInitiator: false,
        friendUid: fromUid,
        reqType: BuddyReqType.PeerInitiator,
        reqSubType: 0,
        reqTime: String(msg.contentHead?.msgTime || Math.floor(Date.now() / 1000)),
        extWords: message,
        flag: 0,
        preGroupingId: 0,
        commFriendNum: 0,
        curFriendMax: 0,
        isShowCard: false,
        isUnread: true,
        isDoubt: false,
        nameMore: '',
        friendNick: String(fromUin),
        friendAvatarUrl: '',
        sourceId: 0,
        groupCode: '0',
        isBuddy: null,
        isAgreed: false,
        relation: 0,
        addSource: decoded.body?.via || '',
        sourceFlag: 0,
      }],
    }

    ctx.parallel('nt/raw/friend-request', notify)
  } catch (e) {
    ctx.logger('qqProtocol').warn('Failed to parse FriendRequest:', (e as Error).message)
  }
}

function handleFriendRecall(ctx: Context, msg: any, content: Buffer) {
  try {
    const decoded = Notify.FriendRecall.decode(content)
    const body = decoded.body
    if (!body) return

    const tip = body.tipInfo?.tip || '消息已撤回'
    const senderUid = body.fromUid
    const senderUin = String(msg.routingHead?.fromUin || 0)
    const peerUid = body.toUid
    const peerUin = String(msg.routingHead?.toUin || 0)

    const recallMessage = buildRecallMessage({
      msgSeq: String(body.sequence || 0),
      senderUid,
      senderUin,
      peerUid,
      peerUin,
      chatType: ChatType.C2C,
      msgTime: msg.contentHead?.msgTime || 0,
      tip,
      operatorUid: senderUid,
      operatorUin: senderUin,
    })

    ctx.parallel('nt/raw/update-msg', [recallMessage])
  } catch (e) {
    ctx.logger('qqProtocol').warn('Failed to parse FriendRecall:', (e as Error).message)
  }
}

// ---- MsgType 732 (Event0x2DC) - Group events ----

function handle0x2DC(ctx: Context, msg: any, subType: number) {
  const content = msg.body?.msgContent
  if (!content) return

  switch (subType) {
    case Event0x2DCSub.GroupRecall:
      handleGroupRecall(ctx, msg, content)
      break

    case Event0x2DCSub.GroupMute:
      handleGroupMute(ctx, content)
      break

    case Event0x2DCSub.GeneralEvent:
      // 16: contains nested NotifyMessageBody with subType=35 (reactions), 12 (group name change), etc.
      handleGroupGeneralEvent(ctx, content)
      break

    case Event0x2DCSub.GroupGrayTip:
      handleGroupGrayTip(ctx, content)
      break

    case Event0x2DCSub.GroupEssenceChange:
      handleGroupEssenceChange(ctx, content)
      break

    default:
      forwardSystemMessage(ctx, msg)
      break
  }
}

function handleGroupMute(ctx: Context, content: Buffer) {
  try {
    const inner = unwrap0x2DCContent(content)
    if (!inner) return
    const decoded: any = Notify.GroupMute.decode(inner)
    const groupCode = String(decoded.groupCode || 0)
    const operatorUid = decoded.operatorUid || ''
    const targetUid = decoded.info?.state?.targetUid
    const duration = decoded.info?.state?.duration || 0

    if (targetUid) {
      ctx.parallel('nt/raw/group-mute', { groupCode, operatorUid, targetUid, duration })
    } else {
      ctx.parallel('nt/raw/group-mute-all', { groupCode, operatorUid, isMute: duration !== 0 })
    }
  } catch (e) {
    ctx.logger('qqProtocol').warn('GroupMute parse error:', (e as Error).message)
  }
}

function handleGroupGeneralEvent(ctx: Context, content: Buffer) {
  try {
    const inner = unwrap0x2DCContent(content)
    if (!inner) return
    // Try GroupReaction first (most common subtype 16 use case)
    const reaction = tryDecodeReaction(inner)
    if (reaction) {
      ctx.parallel('nt/raw/group-reaction', reaction)
    }
  } catch (e) {
    ctx.logger('qqProtocol').warn('GroupGeneralEvent parse error:', (e as Error).message)
  }
}

function tryDecodeReaction(buf: Buffer): { groupCode: string, msgSeq: number, operatorUid: string, code: string, isAdd: boolean, count: number } | null {
  try {
    // GroupReaction is wrapped: NotifyMessageBody.field44 → GroupReaction.data.data.target/data
    const groupReaction: any = walkProtoFields(buf, [44])
    if (!groupReaction) return null
    const decoded: any = Notify.GroupReaction.decode(groupReaction)
    const data = decoded.data?.data
    if (!data) return null
    return {
      groupCode: '0',
      msgSeq: data.target?.sequence || 0,
      operatorUid: data.data?.operatorUid || '',
      code: data.data?.code || '',
      isAdd: data.data?.type === 1,
      count: data.data?.count || 0,
    }
  } catch {
    return null
  }
}

function handleGroupGrayTip(ctx: Context, content: Buffer) {
  try {
    const inner = unwrap0x2DCContent(content)
    if (!inner) return
    const decoded: any = Notify.GeneralGrayTip.decode(inner)
    const bizType = decoded.bizType
    if (bizType === 12) {
      // Poke
      const params: Record<string, string> = {}
      for (const p of decoded.templateParams || []) {
        params[p.key] = p.value
      }
      ctx.parallel('nt/raw/group-poke', {
        groupCode: '0',
        fromUin: params['uin_str2'] || '0',
        toUin: params['uin_str1'] || '0',
        action: params['action_str'] || params['alt_str1'] || '',
        suffix: params['suffix_str'] || '',
        actionImg: params['action_img_url'] || '',
      })
    }
  } catch (e) {
    ctx.logger('qqProtocol').warn('GroupGrayTip parse error:', (e as Error).message)
  }
}

function handleGroupEssenceChange(ctx: Context, content: Buffer) {
  try {
    const inner = unwrap0x2DCContent(content)
    if (!inner) return
    const decoded: any = Notify.GroupEssenceChange.decode(inner)
    ctx.parallel('nt/raw/group-essence-change', {
      groupCode: String(decoded.groupCode || 0),
      msgSequence: decoded.msgSequence || 0,
      operatorUin: String(decoded.operatorUin || 0),
      isAdd: decoded.setFlag === 1,
    })
  } catch (e) {
    ctx.logger('qqProtocol').warn('GroupEssenceChange parse error:', (e as Error).message)
  }
}

/**
 * Strip the leading [4 bytes group code + 1 byte unknown + length-prefix] from 0x2DC content.
 * Returns the inner protobuf body.
 */
function unwrap0x2DCContent(content: Buffer): Buffer | null {
  if (content.length < 7) return null
  let offset = 5
  let length = 0
  let shift = 0
  while (offset < content.length) {
    const b = content[offset++]
    length |= (b & 0x7f) << shift
    if ((b & 0x80) === 0) break
    shift += 7
  }
  return content.subarray(offset, offset + length)
}

/**
 * Walk a protobuf buffer to find a length-delimited field by field number path.
 * Returns the bytes of the deepest matched field.
 */
function walkProtoFields(buf: Buffer, path: number[]): Buffer | null {
  let current = buf
  for (const target of path) {
    let offset = 0
    let found: Buffer | null = null
    while (offset < current.length) {
      let tag = 0
      let shift = 0
      while (offset < current.length) {
        const b = current[offset++]
        tag |= (b & 0x7f) << shift
        if ((b & 0x80) === 0) break
        shift += 7
      }
      const fieldNum = tag >>> 3
      const wireType = tag & 0x07
      if (wireType === 2) {
        let len = 0
        let lenShift = 0
        while (offset < current.length) {
          const b = current[offset++]
          len |= (b & 0x7f) << lenShift
          if ((b & 0x80) === 0) break
          lenShift += 7
        }
        if (fieldNum === target) {
          found = current.subarray(offset, offset + len)
          break
        }
        offset += len
      } else if (wireType === 0) {
        while (offset < current.length && (current[offset] & 0x80) !== 0) offset++
        offset++
      } else if (wireType === 5) offset += 4
      else if (wireType === 1) offset += 8
      else break
    }
    if (!found) return null
    current = found
  }
  return current
}

/**
 * 0x2DC subtype 17 - Group recall
 * Content layout: [4 bytes: groupUin][1 byte: ?][length-prefix: NotifyMessageBody bytes]
 * NotifyMessageBody contains GroupRecall in field varying by version.
 */
function handleGroupRecall(ctx: Context, msg: any, content: Buffer) {
  try {
    // Skip leading 4 bytes group code + 1 byte unknown, then length-prefix wrapped
    if (content.length < 7) return
    const groupCode = content.readUInt32BE(0)
    let offset = 5
    // length prefix is varint, but typically small
    let length = 0
    let shift = 0
    while (offset < content.length) {
      const b = content[offset++]
      length |= (b & 0x7f) << shift
      if ((b & 0x80) === 0) break
      shift += 7
    }
    const bodyBytes = content.subarray(offset, offset + length)

    // Try to decode GroupRecall directly from extracted body
    const decoded = tryDecodeGroupRecall(bodyBytes)
    if (!decoded) return

    const operatorUid = decoded.operatorUid || ''
    const peerUin = String(groupCode)

    const recallMessage = buildRecallMessage({
      msgSeq: String(decoded.info?.sequence || 0),
      senderUid: decoded.info?.authorUid || '',
      senderUin: '0',
      peerUid: peerUin,
      peerUin,
      chatType: ChatType.Group,
      msgTime: decoded.info?.time || msg.contentHead?.msgTime || 0,
      tip: decoded.tipInfo?.tip || '消息已撤回',
      operatorUid,
      operatorUin: '0',
    })

    ctx.parallel('nt/raw/update-msg', [recallMessage])
  } catch (e) {
    ctx.logger('qqProtocol').warn('Failed to parse GroupRecall:', (e as Error).message)
  }
}

function tryDecodeGroupRecall(buf: Buffer): any | null {
  // GroupRecall is wrapped under NotifyMessageBody.field11 in some versions.
  // Try to find a length-delimited field that decodes as GroupRecall.
  try {
    return Notify.GroupRecall.decode(buf)
  } catch {}

  // Walk top-level fields and try each length-delimited child
  let offset = 0
  while (offset < buf.length) {
    let tag = 0
    let shift = 0
    while (offset < buf.length) {
      const b = buf[offset++]
      tag |= (b & 0x7f) << shift
      if ((b & 0x80) === 0) break
      shift += 7
    }
    const wireType = tag & 0x07
    if (wireType === 2) {
      let len = 0
      let lenShift = 0
      while (offset < buf.length) {
        const b = buf[offset++]
        len |= (b & 0x7f) << lenShift
        if ((b & 0x80) === 0) break
        lenShift += 7
      }
      const child = buf.subarray(offset, offset + len)
      offset += len
      try {
        const decoded = Notify.GroupRecall.decode(child)
        if (decoded.info && decoded.info.sequence) return decoded
      } catch {}
    } else if (wireType === 0) {
      while (offset < buf.length && (buf[offset] & 0x80) !== 0) offset++
      offset++
    } else if (wireType === 5) offset += 4
    else if (wireType === 1) offset += 8
    else break
  }
  return null
}

// ---- Group join / invite ----

function handleGroupJoinRequest(ctx: Context, msg: any) {
  // MsgType 84: 入群申请通知
  try {
    const content = msg.body?.msgContent
    if (!content) return
    const decoded = Notify.GroupJoinRequest.decode(content)

    const notify = {
      seq: String(msg.contentHead?.msgSeq || Date.now()),
      type: GroupNotifyType.RequestJoinNeedAdminiStratorPass,
      status: GroupNotifyStatus.Unhandle,
      group: { groupCode: String(decoded.groupCode), groupName: '' },
      user1: { uid: decoded.memberUid, nickName: '' },
      user2: { uid: '', nickName: '' },
      actionUser: { uid: '', nickName: '' },
      actionTime: String(msg.contentHead?.msgTime || 0),
      invitationExt: { srcType: 0, groupCode: '', waitStatus: 0, invitorRole: 0 },
      postscript: '',
      repeatSeqs: [],
      warningTips: '',
      templateSeq: '',
      groupFlagExt3: 0,
      joinGroupTransInfo: {},
    } as unknown as GroupNotify

    ctx.parallel('nt/raw/group-notifies-updated', [false, [notify]])
  } catch (e) {
    ctx.logger('qqProtocol').warn('Failed to parse GroupJoinRequest:', (e as Error).message)
  }
}

function handleGroupInvitation(ctx: Context, msg: any, msgType: number) {
  try {
    const content = msg.body?.msgContent
    if (!content) return

    let groupCode = '0'
    let invitorUid = ''
    let targetUid = ''

    if (msgType === MsgType.GroupInvitation) {
      const decoded = Notify.GroupInvitedJoinRequest.decode(content)
      const inner = decoded.info?.inner
      if (inner) {
        groupCode = String(inner.groupCode)
        invitorUid = inner.invitorUid
        targetUid = inner.targetUid
      }
    } else {
      const decoded = Notify.GroupInvitation.decode(content)
      groupCode = String(decoded.groupCode)
      invitorUid = decoded.invitorUid
      targetUid = selfInfo.uid
    }

    const notify = {
      seq: String(msg.contentHead?.msgSeq || Date.now()),
      type: GroupNotifyType.InvitedByMember,
      status: GroupNotifyStatus.Unhandle,
      group: { groupCode, groupName: '' },
      user1: { uid: targetUid, nickName: '' },
      user2: { uid: invitorUid, nickName: '' },
      actionUser: { uid: invitorUid, nickName: '' },
      actionTime: String(msg.contentHead?.msgTime || 0),
      invitationExt: { srcType: 0, groupCode, waitStatus: 0, invitorRole: 0 },
      postscript: '',
      repeatSeqs: [],
      warningTips: '',
      templateSeq: '',
      groupFlagExt3: 0,
      joinGroupTransInfo: {},
    } as unknown as GroupNotify

    ctx.parallel('nt/raw/group-notifies-updated', [false, [notify]])
  } catch (e) {
    ctx.logger('qqProtocol').warn('Failed to parse GroupInvitation:', (e as Error).message)
  }
}

// ---- Common helpers ----

interface RecallParams {
  msgSeq: string
  senderUid: string
  senderUin: string
  peerUid: string
  peerUin: string
  chatType: ChatType
  msgTime: number
  tip: string
  operatorUid: string
  operatorUin: string
}

function buildRecallMessage(p: RecallParams): RawMessage {
  return {
    msgId: `recall_${p.msgSeq}_${Date.now()}`,
    msgType: 5,
    subMsgType: 4,
    msgTime: String(p.msgTime || Math.floor(Date.now() / 1000)),
    msgSeq: p.msgSeq,
    msgRandom: '0',
    senderUid: p.senderUid,
    senderUin: p.senderUin,
    peerUid: p.peerUid,
    peerUin: p.peerUin,
    guildId: '',
    sendNickName: '',
    sendMemberName: '',
    sendRemarkName: '',
    chatType: p.chatType,
    sendStatus: 2,
    recallTime: String(Math.floor(Date.now() / 1000)),
    records: [],
    elements: [{
      elementType: ElementType.GrayTip,
      elementId: '',
      extBufForUI: '',
      grayTipElement: {
        subElementType: GrayTipElementSubType.Revoke,
        revokeElement: {
          operatorTinyId: '',
          operatorRole: '',
          operatorUid: p.operatorUid,
          operatorNick: '',
          operatorRemark: '',
          operatorMemRemark: '',
          origMsgSenderUid: p.senderUid,
          origMsgSenderNick: '',
          origMsgSenderRemark: '',
        },
      },
    }] as any,
    peerName: '',
    emojiLikesList: [],
    msgAttrs: new Map(),
    isOnlineMsg: true,
  } as RawMessage
}

function handleChatMessage(ctx: Context, msg: any, msgType: number) {
  const rawMessage = convertToRawMessage(msg, msgType)
  if (!rawMessage) return
  const isSelfMsg = rawMessage.senderUin === selfInfo.uin
  if (isSelfMsg) {
    ctx.parallel('nt/raw/self-send-msg', rawMessage)
    ctx.parallel('nt/raw/update-msg', [rawMessage])
    return
  }
  ctx.parallel('nt/raw/new-msg', [rawMessage])
}

/** 把 Msg.Message protobuf 转换为上层用的 RawMessage（OlPush 推送和 SsoGetGroupMsg 拉历史共用） */
export function convertToRawMessage(msg: any, msgType: number): RawMessage | null {
  const routingHead = msg.routingHead
  const contentHead = msg.contentHead
  const body = msg.body

  if (!routingHead || !contentHead) return null

  let chatType: ChatType
  let peerUin: string
  let peerUid: string
  let sendMemberName = ''

  if (msgType === MsgType.GroupMessage) {
    chatType = ChatType.Group
    peerUin = String(routingHead.group?.groupCode || 0)
    peerUid = peerUin
    sendMemberName = routingHead.group?.groupCard || ''
  } else if (msgType === MsgType.TempMessage) {
    chatType = ChatType.TempC2CFromGroup
    peerUin = String(routingHead.fromUin || 0)
    peerUid = routingHead.fromUid || ''
  } else {
    chatType = ChatType.C2C
    peerUin = String(routingHead.fromUin || 0)
    peerUid = routingHead.fromUid || ''
  }

  const elements = parseElements(body?.richText?.elems || [])

  const senderUin = String(routingHead.fromUin || 0)
  const isSelfMsg = senderUin === selfInfo.uin

  return {
    msgId: String(contentHead.msgUid || contentHead.msgSeq || Date.now()),
    msgType: 2,
    subMsgType: 0,
    msgTime: String(contentHead.msgTime || Math.floor(Date.now() / 1000)),
    msgSeq: String(contentHead.msgSeq || 0),
    msgRandom: String(contentHead.random || 0),
    senderUid: routingHead.fromUid || '',
    senderUin,
    peerUid,
    peerUin,
    guildId: '',
    sendNickName: routingHead.c2c?.friendName || sendMemberName || '',
    sendMemberName,
    sendRemarkName: '',
    chatType,
    sendStatus: isSelfMsg ? 2 : 0,
    recallTime: '0',
    records: [],
    elements,
    peerName: routingHead.group?.groupName || '',
    emojiLikesList: [],
    msgAttrs: new Map(),
    isOnlineMsg: true,
  }
}

function parseElements(elems: any[]): MessageElement[] {
  const result: any[] = []

  for (const elem of elems) {
    if (!elem) continue

    if (elem.text) {
      const textElem = elem.text
      const isAt = textElem.attr6Buf && textElem.attr6Buf.length > 0
      result.push({
        elementType: ElementType.Text,
        elementId: '',
        extBufForUI: '',
        textElement: {
          content: textElem.str || '',
          atType: isAt ? (textElem.attr6Buf[6] === 1 ? 1 : 2) : 0,
          atUid: '',
          atNtUid: '',
          atTinyId: '',
          subElementType: 0,
          atChannelId: '',
        },
      })
      continue
    }

    if (elem.face) {
      result.push({
        elementType: ElementType.Face,
        elementId: '',
        extBufForUI: '',
        faceElement: {
          faceIndex: elem.face.index,
          faceType: 1,
          faceText: '',
          stickerId: '',
          stickerType: 0,
          packId: '',
          sourceType: 0,
          resultId: '',
          superisedId: '',
          randomType: 0,
          imageType: 0,
          pokeType: 0,
          spokeSummary: '',
          doubleHit: 0,
          vaspiPath: '',
          surpriseId: '',
        },
      })
      continue
    }

    // Old format C2C image
    if (elem.notOnlineImage) {
      const img = elem.notOnlineImage
      result.push({
        elementType: ElementType.Pic,
        elementId: '',
        extBufForUI: '',
        picElement: {
          fileName: img.filePath || '',
          fileSize: String(img.fileLen || 0),
          picWidth: img.picWidth || 0,
          picHeight: img.picHeight || 0,
          original: img.original === 1,
          md5HexStr: img.picMd5 ? Buffer.from(img.picMd5).toString('hex') : '',
          sourcePath: '',
          thumbPath: new Map(),
          picType: 0,
          picSubType: 0,
          fileUuid: img.resId || '',
          fileSubId: '',
          thumbFileSize: 0,
          originImageUrl: img.origUrl || '',
          thumbUrl: img.thumbUrl || '',
          bigUrl: img.bigUrl || '',
        },
      })
      continue
    }

    // Group image / animated face
    if (elem.customFace) {
      const cf = elem.customFace
      result.push({
        elementType: ElementType.Pic,
        elementId: '',
        extBufForUI: '',
        picElement: {
          fileName: cf.filePath || '',
          fileSize: String(cf.size || 0),
          picWidth: cf.width || 0,
          picHeight: cf.height || 0,
          original: false,
          md5HexStr: cf.md5 ? Buffer.from(cf.md5).toString('hex') : '',
          sourcePath: '',
          thumbPath: new Map(),
          picType: 0,
          picSubType: 0,
          fileUuid: '',
          fileSubId: '',
          thumbFileSize: 0,
          originImageUrl: cf.origUrl || '',
          thumbUrl: cf.thumbUrl || '',
          bigUrl: cf.bigUrl || '',
        },
      })
      continue
    }

    // Market face / sticker
    if (elem.marketFace) {
      const mf = elem.marketFace
      result.push({
        elementType: ElementType.MarketFace,
        elementId: '',
        extBufForUI: '',
        marketFaceElement: {
          itemType: mf.itemType || 0,
          faceInfo: 0,
          emojiPackageId: mf.tabId || 0,
          subType: mf.subType || 0,
          mediaType: 0,
          imageWidth: mf.width || 0,
          imageHeight: mf.height || 0,
          faceName: mf.summary || '',
          emojiId: mf.faceId ? Buffer.from(mf.faceId).toString('hex') : '',
          key: mf.key || '',
          param: '',
          mobileParam: '',
          dynamicImg: { name: '', md5: '', uuid: '' },
          staticImg: { name: '', md5: '', uuid: '' },
          subElementType: 0,
        },
      })
      continue
    }

    // Old format video
    if (elem.videoFile) {
      const v = elem.videoFile
      result.push({
        elementType: ElementType.Video,
        elementId: '',
        extBufForUI: '',
        videoElement: {
          filePath: '',
          fileName: v.fileName || '',
          videoMd5: v.fileMd5 ? Buffer.from(v.fileMd5).toString('hex') : '',
          thumbMd5: v.thumbFileMd5 ? Buffer.from(v.thumbFileMd5).toString('hex') : '',
          fileTime: v.fileTime || 0,
          thumbSize: 0,
          fileFormat: v.fileFormat || 0,
          fileSize: String(v.fileSize || 0),
          thumbWidth: v.thumbWidth || 0,
          thumbHeight: v.thumbHeight || 0,
          busiType: 0,
          subBusiType: 0,
          thumbPath: new Map(),
          transferStatus: 0,
          progress: 0,
          invalidState: 0,
          fileUuid: v.fileUuid || '',
          fileSubId: '',
          fileBizId: 0,
          originVideoMd5: '',
          import_rich_media_context: null,
          sourceVideoCodecFormat: 0,
        },
      })
      continue
    }

    if (elem.richMsg) {
      // serviceId 35 = forward message, others are ark
      const isForward = elem.richMsg.serviceId === 35
      let template = ''
      try {
        const buf = elem.richMsg.template
        if (buf && buf.length > 1) {
          template = unzipSync(buf.subarray(1)).toString()
        }
      } catch {
        template = elem.richMsg.template?.toString() || ''
      }
      if (isForward) {
        result.push({
          elementType: ElementType.MultiForward,
          elementId: '',
          extBufForUI: '',
          multiForwardMsgElement: {
            xmlContent: template,
            resId: '',
            fileName: '',
          },
        })
      } else {
        result.push({
          elementType: ElementType.Ark,
          elementId: '',
          extBufForUI: '',
          arkElement: {
            bytesData: template,
            linkInfo: null,
            subElementType: null,
          },
        })
      }
      continue
    }

    // Group file
    if (elem.groupFile) {
      const gf = elem.groupFile
      result.push({
        elementType: ElementType.File,
        elementId: '',
        extBufForUI: '',
        fileElement: {
          fileName: gf.filename || '',
          fileSize: String(gf.fileSize || 0),
          fileMd5: '',
          expireTime: '0',
          fileId: gf.fileId ? Buffer.from(gf.fileId).toString() : '',
          fileUuid: '',
          fileSubId: '',
          thumbFileSize: 0,
          picThumbPath: new Map(),
          fileBizId: 0,
        },
      })
      continue
    }

    // @ mention extra info
    if (elem.extraInfo) {
      const last = result[result.length - 1]
      // If previous element is a Text @ mention, fill in nick/uin
      if (last?.textElement?.atType) {
        last.textElement.atUid = String(elem.extraInfo.uin || 0)
        if (elem.extraInfo.nick) {
          last.textElement.content = '@' + elem.extraInfo.nick
        }
      }
      continue
    }

    if (elem.lightApp) {
      let jsonStr = ''
      if (elem.lightApp.data && elem.lightApp.data.length > 1) {
        try {
          jsonStr = unzipSync(elem.lightApp.data.subarray(1)).toString()
        } catch {
          jsonStr = elem.lightApp.data.subarray(1).toString()
        }
      }
      result.push({
        elementType: ElementType.Ark,
        elementId: '',
        extBufForUI: '',
        arkElement: {
          bytesData: jsonStr,
          linkInfo: null,
          subElementType: null,
        },
      })
      continue
    }

    if (elem.srcMsg) {
      result.push({
        elementType: ElementType.Reply,
        elementId: '',
        extBufForUI: '',
        replyElement: {
          replayMsgId: '',
          replayMsgSeq: String(elem.srcMsg.origSeqs?.[0] || 0),
          senderUid: String(elem.srcMsg.senderUin || 0),
          senderUidStr: '',
          replyMsgTime: String(elem.srcMsg.time || 0),
          sourceMsgIdInRecords: '',
        },
      })
      continue
    }

    // commonElem with serviceType=48 wraps multimedia (image/voice/video)
    if (elem.commonElem) {
      const svcType = elem.commonElem.serviceType
      const bizType = elem.commonElem.businessType
      const pbElem = elem.commonElem.pbElem

      if (svcType === 48 && pbElem) {
        const parsed = parseMsgInfoElement(pbElem, bizType)
        if (parsed) {
          result.push(parsed)
          continue
        }
      }
    }
  }

  return result
}

/**
 * Parse commonElem.pbElem (MsgInfo protobuf) for serviceType=48.
 * bizType: 10/20=image, 11/21=video, 12/22=voice
 */
function parseMsgInfoElement(pbElem: Buffer, bizType: number): any | null {
  try {
    const msgInfo: any = Media.MsgInfo.decode(pbElem)
    const body = msgInfo.msgInfoBody?.[0]
    if (!body) return null

    const fileInfo = body.index?.info
    const picInfo = body.pic
    const fileUuid = body.index?.fileUuid || ''
    const fileSize = String(fileInfo?.fileSize || 0)
    const fileName = fileInfo?.fileName || ''
    const md5 = fileInfo?.md5HexStr || ''
    const sha1 = fileInfo?.sha1HexStr || ''
    const width = fileInfo?.width || 0
    const height = fileInfo?.height || 0

    if (bizType === 10 || bizType === 20) {
      // Image
      let url = ''
      if (picInfo?.urlPath) {
        const domain = picInfo.domain || 'https://multimedia.nt.qq.com.cn'
        url = (domain.startsWith('http') ? domain : 'https://' + domain) + picInfo.urlPath
        if (picInfo.ext?.originalParam) {
          url += picInfo.ext.originalParam
        }
      }
      return {
        elementType: ElementType.Pic,
        elementId: '',
        extBufForUI: '',
        picElement: {
          fileName,
          fileSize,
          picWidth: width,
          picHeight: height,
          original: false,
          md5HexStr: md5,
          sourcePath: '',
          thumbPath: new Map(),
          picType: 0,
          picSubType: 0,
          fileUuid,
          fileSubId: '',
          thumbFileSize: 0,
          originImageUrl: url,
        },
      }
    } else if (bizType === 12 || bizType === 22) {
      // Voice
      return {
        elementType: ElementType.Ptt,
        elementId: '',
        extBufForUI: '',
        pttElement: {
          fileName,
          filePath: '',
          md5HexStr: md5,
          fileSize,
          duration: fileInfo?.time || 0,
          formatType: fileInfo?.fileType?.pttFormat || 1,
          voiceType: 1,
          voiceChangeType: 0,
          canConvert2Text: false,
          fileId: 0,
          fileUuid,
          text: '',
        },
      }
    } else if (bizType === 11 || bizType === 21) {
      // Video
      return {
        elementType: ElementType.Video,
        elementId: '',
        extBufForUI: '',
        videoElement: {
          filePath: '',
          fileName,
          videoMd5: md5,
          thumbMd5: '',
          fileTime: fileInfo?.time || 0,
          thumbSize: 0,
          fileFormat: fileInfo?.fileType?.videoFormat || 0,
          fileSize,
          thumbWidth: 0,
          thumbHeight: 0,
          busiType: 0,
          subBusiType: 0,
          thumbPath: new Map(),
          transferStatus: 0,
          progress: 0,
          invalidState: 0,
          fileUuid,
          fileSubId: '',
          fileBizId: 0,
          originVideoMd5: '',
          import_rich_media_context: null,
          sourceVideoCodecFormat: 0,
        },
      }
    }
  } catch {}
  return null
}
