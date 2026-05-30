import { Msg, Notify } from '@/ntqqapi/proto'
import { ChatType, ElementType, RawMessage, GrayTipElementSubType, FriendRequestNotify, BuddyReqType, GroupNotificationType, RequestState } from '@/ntqqapi/types'
import type { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { parseElements } from './helper/messageParsing'
import { InferProtoModel } from '@saltify/typeproto'
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
  GroupJoined = 85,
  GroupInvitation = 87,
  GroupInvitedJoinRequest = 525,
  Event0x210 = 528,
  Event0x2DC = 732,
}

const enum Event0x210Sub {
  FriendRequest = 35,
  FriendDeleteOrPinChanged = 39,
  PttTransResult = 61,
  FriendRecall = 138,
  FriendSelfRecall = 139,
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
      ctx.logger.warn('dispatch error:', (e as Error).message)
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
      handleGroupMemberIncrease(ctx, msg)
      break

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
    case MsgType.GroupInvitedJoinRequest:
      handleGroupInvitation(ctx, msg, msgType)
      break

    case MsgType.GroupJoined:
      handleGroupJoined(ctx, msg)
      break
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
      memberUid: decoded.memberUid,
      memberUin: await ctx.ntUserApi.getUinByUid(decoded.memberUid),
      operatorUid: decoded.adminUid,
      operatorUin: await ctx.ntUserApi.getUinByUid(decoded.adminUid)
    })
  } else if (decoded.type === 131) {
    ctx.parallel('nt/group-member-added', {
      groupCode: decoded.groupCode,
      memberUid: decoded.memberUid,
      memberUin: await ctx.ntUserApi.getUinByUid(decoded.memberUid),
      invitorUid: decoded.adminUid,
      invitorUin: await ctx.ntUserApi.getUinByUid(decoded.adminUid)
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

function forwardSystemMessage(ctx: Context, msg: InferProtoModel<typeof Msg.Message>) {
  const messageBytes = Msg.Message.encode(msg)
  ctx.parallel('nt/system-message-created', Buffer.from(messageBytes))
}

/** 解析 KickNT 被踢下线推送，emit 'nt/kicked-offLine' */
function handleKickNT(ctx: Context, payload: Buffer) {
  let info = {
    appId: 0,
    instanceId: 0,
    sameDevice: false,
    tipsDesc: 'Kicked by server',
    tipsTitle: '下线通知',
    kickedType: 0,
    securityKickedType: 0,
  }
  try {
    const decoded = Msg.KickNTPush.decode(payload)
    info = {
      ...info,
      tipsDesc: decoded.tipsDesc || info.tipsDesc,
      tipsTitle: decoded.tipsTitle || info.tipsTitle,
      kickedType: Number(decoded.code ?? 0),
    }
  } catch (e) {
    ctx.logger.warn('KickNT parse error:', (e as Error).message)
  }
  ctx.parallel('nt/raw/kicked-offline', info)
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
      handleFriendRecall(ctx, msg, content)
      break

    case Event0x210Sub.FriendDeleteOrPinChanged:
      handleFriendDeleteOrPin(ctx, msg, content)
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

    default:
      forwardSystemMessage(ctx, msg)
      break
  }
}

function handleGroupRemoved(ctx: Context, content: Buffer) {
  const decoded = Notify.GroupRemoved.decode(content)
  ctx.parallel('nt/group-removed', decoded)
}

function handleFriendDeleteOrPin(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, content: Buffer) {
  try {
    const decoded = Notify.FriendDeleteOrPinChange.decode(content)
    const pinChanged = decoded.body?.pinChanged
    if (pinChanged) {
      const uid = pinChanged.body?.uid || ''
      // info.timestamp 非空 = pin，空 = unpin（实测 server 行为）
      const isPinned = (pinChanged.body?.info?.timestamp?.length ?? 0) !== 0
      ctx.parallel('nt/raw/friend-pin-changed', { uid, isPinned })
      // 同时 forward 完整 sysmsg：milky transformSystemMessageEvent 走这条路径
      // 来产出 peer_pin_change（msgType=528 subType=39 + body.type=7）。
      forwardSystemMessage(ctx, msg)
      return
    }
    // 其他 type；forward 完整 Msg.Message 让 adapter 处理（profile_like 走这里）
    forwardSystemMessage(ctx, msg)
  } catch (e) {
    ctx.logger.warn('FriendDeleteOrPin parse error:', (e as Error).message)
  }
}

function handleFriendGrayTip(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, content: Buffer) {
  try {
    const decoded: any = Notify.GeneralGrayTip.decode(content)
    const bizType = Number(decoded.bizType ?? 0)
    const busiId = Number(decoded.busiId ?? 0)
    const templId = Number(decoded.templId ?? 0)
    const params: Record<string, string> = {}
    for (const p of decoded.templateParams || []) {
      params[p.key] = p.value
    }
    const msgUid = String(msg?.contentHead?.msgUid || 0)
    if (bizType === 12) {
      ctx.parallel('nt/raw/friend-poke', {
        // uin_str1 = 操作者，uin_str2 = 被戳的人
        fromUin: params['uin_str1'] || '0',
        toUin: params['uin_str2'] || '0',
        action: params['action_str'] || params['alt_str1'] || '',
        suffix: params['suffix_str'] || '',
        actionImg: params['action_img_url'] || '',
        msgUid,
      })
    } else if (busiId === 19324 || templId === 10229) {
      // 你已添加X为好友
      const peerUin = params['peer_uin'] || params['friend_uin']
        || params['uin'] || params['target_uin'] || '0'
      const peerUid = params['peer_uid'] || params['friend_uid'] || ''
      ctx.parallel('nt/raw/friend-added', { peerUin, peerUid })
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
    // pttTrans 服务自己用的 chatType（1=group, 2=c2c）跟项目里的 ChatType 枚举（C2C=1, Group=2）刚好反过来，转一下
    const rawType = Number(body.chatType ?? 0)
    const chatType = rawType === 1 ? ChatType.Group : rawType === 2 ? ChatType.C2C : ChatType.C2C
    ctx.parallel('nt/raw/ptt-trans-result', {
      msgUid: String(body.msgUid ?? 0),
      chatType,
      peerUin: String(body.groupOrReceiverUin ?? 0),
      senderUin: String(body.senderUin ?? 0),
      text: body.text || '',
    })
  } catch (e) {
    ctx.logger.warn('PttTransResult parse error:', (e as Error).message)
  }
}

function handleFriendRequest(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, content: Buffer) {
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
    ctx.logger.warn('Failed to parse FriendRequest:', (e as Error).message)
  }
}

async function handleFriendRecall(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, content: Buffer) {
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
      peerUid,
      peerUin,
      msgId: body.msgUid.toString(),
      msgSeq: body.sequence,
      msgRandom: body.random,
      senderUid: fromUid,
      senderUin: fromUin,
      operatorUid: fromUid,
      operatorUin: fromUin,
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
      handleGroupGrayTip(ctx, msg, content)
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
    // GroupMute (0x2DC subType=12) 的 msgContent 直接是 GroupMute proto，
    // 不像 subType=16/20/21 那样有 [4B groupUin + 1B + 2B len] TLV 包头。
    // 老代码错误地走 unwrap0x2DCContent，导致 field 1 (groupCode) 解出来是错的内部 ID。
    const decoded: any = Notify.GroupMute.decode(content)
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
    ctx.logger.warn('GroupMute parse error:', (e as Error).message)
  }
}

function handleGroupGeneralEvent(ctx: Context, content: Buffer) {
  try {
    if (content.length < 7) return
    const groupUinFromTLV = content.readUInt32BE(0)
    const inner = unwrap0x2DCContent(content)
    if (!inner) return
    let groupCode = String(groupUinFromTLV)
    let notifyBody: any = null
    try {
      notifyBody = Notify.NotifyMessageBody.decode(inner)
      if (notifyBody.groupCode) groupCode = String(notifyBody.groupCode)
    } catch { /* ignore */ }
    // 0x2DC subType=16 通过 field13 区分子事件：
    //   6 = GroupMemberSpecialTitle, 12 = GroupNameChange, 23 = GroupTodo, 35 = GroupReaction
    const field13 = Number(notifyBody?.subType ?? 0)
    if (field13 === 35 || field13 === 0) {
      const reaction = tryDecodeReaction(inner)
      if (reaction) {
        reaction.groupCode = groupCode
        ctx.parallel('nt/raw/group-reaction', reaction)
        return
      }
    }
    if (field13 === 6) {
      // 群成员获得头衔（GroupMemberSpecialTitle）。eventParam (field 5) 是一个 proto，
      // 内部 field 2 是带 JSON 模板的灰条文字，形如：
      //   恭喜<{"cmd":5,"data":"<uin>","text":"<nick>"}>获得群主授予的<{"cmd":1,"text":"<title>",...}>头衔
      const eventParam = notifyBody?.eventParam
      if (!eventParam) return
      const tipBytes = walkProtoFields(Buffer.from(eventParam), [2])
      if (!tipBytes) return
      const tipText = tipBytes.toString('utf8')
      // cmd=5 是用户引用，data 是 uin；cmd=1 是带链接的文本，text 是真正的头衔
      const userMatch = tipText.match(/\{"cmd":5,"data":"(\d+)"/)
      const titleMatch = tipText.match(/\{"cmd":1,[^}]*?"text":"([^"]+)"/)
      const memberUin = userMatch?.[1] || '0'
      const title = titleMatch?.[1] || ''
      if (memberUin !== '0' && title) {
        ctx.parallel('nt/raw/group-title-changed', { groupCode, memberUin, title })
      }
      return
    }
    if (field13 === 12) {
      // GroupNameChange：eventParam 是 GroupNameChangeBody（field 1=1, field 2=新群名）。
      // operatorUid 在 NotifyMessageBody.field 21 (notifyBody.operatorUid)。
      const eventParam = notifyBody?.eventParam
      if (!eventParam) return
      try {
        const body = Notify.GroupNameChangeBody.decode(Buffer.from(eventParam))
        if (body.newName) {
          ctx.parallel('nt/raw/group-name-changed', {
            groupCode,
            newName: body.newName,
            operatorUid: notifyBody?.operatorUid || '',
          })
        }
      } catch (e) {
        ctx.logger.warn('[Group0x2DC field13=12] decode err:', (e as Error).message)
      }
      return
    }
    // 兜底：未识别的 subType=16 事件
    if (field13 !== 0) {
      ctx.logger.debug('[Group0x2DC sub16] unhandled field13:', field13, 'groupCode:', groupCode)
    }
  } catch (e) {
    ctx.logger.warn('GroupGeneralEvent parse error:', (e as Error).message)
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

function handleGroupGrayTip(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, content: Buffer) {
  try {
    if (content.length < 7) return
    const groupUinFromTLV = content.readUInt32BE(0)
    const inner = unwrap0x2DCContent(content)
    if (!inner) return
    const notifyBody: any = Notify.NotifyMessageBody.decode(inner)
    const grayTip = notifyBody.generalGrayTip
    if (!grayTip) return
    // 优先用 NotifyMessageBody.groupCode (field 4)，fallback 用 TLV 头 4 字节
    const groupCode = String(notifyBody.groupCode || groupUinFromTLV)
    const bizType = Number(grayTip.bizType ?? 0)
    const busiId = Number(grayTip.busiId ?? 0)
    const params: Record<string, string> = {}
    for (const p of grayTip.templateParams || []) {
      params[p.key] = p.value
    }
    const msgUid = String(msg?.contentHead?.msgUid || 0)
    if (bizType === 12) {
      // Poke (group)
      ctx.parallel('nt/raw/group-poke', {
        groupCode,
        // uin_str1 = 操作者（fromUin），uin_str2 = 被戳的人（toUin）
        fromUin: params['uin_str1'] || '0',
        toUin: params['uin_str2'] || '0',
        action: params['action_str'] || params['alt_str1'] || '',
        suffix: params['suffix_str'] || '',
        actionImg: params['action_img_url'] || '',
        msgUid,
      })
    } else if (busiId === 2407) {
      // 群成员获得头衔（旧版本通过 subType=20 推送的 fallback 路径，新版本走 subType=16 field13=6）
      const memberUin = params['mqq_uin'] || params['member_uin']
        || params['uin'] || params['target_uin'] || '0'
      const title = params['title'] || params['new_title'] || params['honor'] || ''
      if (memberUin !== '0' && title) {
        ctx.parallel('nt/raw/group-title-changed', {
          groupCode,
          memberUin,
          title,
        })
      }
    }
  } catch (e) {
    ctx.logger.warn('GroupGrayTip parse error:', (e as Error).message)
  }
}

function handleGroupEssenceChange(ctx: Context, content: Buffer) {
  try {
    if (content.length < 7) return
    const groupUin = content.readUInt32BE(0)
    const inner = unwrap0x2DCContent(content)
    if (!inner) return
    // 0x2DC 内层是 NotifyMessageBody 结构，groupUin 在 field 4，typed event 在 field 33
    const notifyBody: any = Notify.NotifyMessageBody.decode(inner)
    const essenceField = walkProtoFields(inner, [33])
    if (!essenceField) return
    const decoded: any = Notify.GroupEssenceChange.decode(essenceField)
    ctx.parallel('nt/raw/group-essence-change', {
      groupCode: String(notifyBody.groupCode || decoded.groupCode || groupUin),
      msgSequence: decoded.msgSequence || 0,
      operatorUin: String(decoded.operatorUin || 0),
      isAdd: decoded.setFlag === 1,
    })
  } catch (e) {
    ctx.logger.warn('GroupEssenceChange parse error:', (e as Error).message)
  }
}

/**
 * Strip the leading [4 bytes group code + 1 byte unknown + length-prefix] from 0x2DC content.
 * Returns the inner protobuf body.
 */
function unwrap0x2DCContent(content: Buffer): Buffer | null {
  // 0x2DC content: [4 bytes BE: groupUin][1 byte: ?][2 bytes BE: length][NotifyMessageBody bytes]
  if (content.length < 7) return null
  const length = content.readUInt16BE(5)
  return content.subarray(7, 7 + length)
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
 * Content layout: [4 bytes BE: groupUin][1 byte: ?][2 bytes BE length][NotifyMessageBody bytes]
 * NotifyMessageBody.field11 = GroupRecall (with repeated RecallMessages at field 3)
 */
async function handleGroupRecall(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, content: Buffer) {
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
        peerUid: groupCode.toString(),
        peerUin: groupCode,
        msgId: String((0x01000000n << 32n) | BigInt(rm.random)),
        msgSeq: rm.sequence,
        msgRandom: rm.random,
        senderUid: rm.authorUid,
        senderUin: await ctx.ntUserApi.getUinByUid(rm.authorUid),
        operatorUid,
        operatorUin,
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
    const decoded = Notify.GroupJoinRequest.decode(msg.body!.msgContent)
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
        initiatorUid: decoded.memberUid,
        initiatorUin: await ctx.ntUserApi.getUinByUid(decoded.memberUid),
        notificationSeq,
        isDoubt,
        comment: commit!
      })
    }
  } catch (e) {
    ctx.logger.warn('Failed to parse GroupJoinRequest:', (e as Error).message)
  }
}

async function handleGroupInvitation(ctx: Context, msg: InferProtoModel<typeof Msg.Message>, msgType: number) {
  try {
    const content = msg.body!.msgContent
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
          initiatorUid: inner.invitorUid,
          initiatorUin: await ctx.ntUserApi.getUinByUid(inner.invitorUid),
          targetUserUid: inner.targetUid,
          targetUserUin: await ctx.ntUserApi.getUinByUid(inner.targetUid),
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
          initiatorUid: decoded.invitorUid,
          initiatorUin: await ctx.ntUserApi.getUinByUid(decoded.invitorUid),
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
            initiatorUid: msg.routingHead.fromUid,
            initiatorUin: msg.routingHead.fromUin,
            invitationSeq: BigInt(seq)
          })
        }
      }
    }
  }
  const rawMessage = convertToRawMessage(msg)
  if (!rawMessage) return
  const isSelfMsg = rawMessage.senderUin === +selfInfo.uin
  if (isSelfMsg) {
    ctx.parallel('nt/raw/self-send-msg', rawMessage)
    ctx.parallel('nt/raw/update-msg', [rawMessage])
    return
  }
  ctx.parallel('nt/raw/new-msg', [rawMessage])
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

  const elements = parseElements(body?.richText?.elems || [])

  // C2C 离线文件（trans 0x211 + msgType=PrivateFile）：内容在 body.msgContent 而不是 richText.elems
  if (msgType === MsgType.PrivateFile && body?.msgContent && elements.length === 0) {
    try {
      const fe = Msg.FileExtra.decode(Buffer.from(body.msgContent))
      const nof = fe.file
      if (nof) {
        elements.push({
          elementType: ElementType.File,
          elementId: '',
          extBufForUI: '',
          fileElement: {
            fileName: nof.fileName || '',
            fileSize: String(nof.fileSize ?? 0),
            fileMd5: nof.fileMd5 ? Buffer.from(nof.fileMd5).toString('hex') : '',
            expireTime: String(nof.expireTime ?? 0),
            fileId: nof.fileUuid || '',
            fileUuid: nof.fileUuid || '',
            fileSubId: '',
            thumbFileSize: 0,
            picThumbPath: new Map(),
            fileBizId: 0,
          },
        } as any)
      }
    } catch (e) {
      console.warn('PrivateFile FileExtra decode failed:', (e as Error).message)
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
    clientSeq: contentHead.c2cMsgSeq ? contentHead.groupMsgSeqOrC2cClientSeq : 0
  }
}
