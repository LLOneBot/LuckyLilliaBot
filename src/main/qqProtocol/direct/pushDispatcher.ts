import { Msg, Notify } from '@/ntqqapi/proto'
import { ChatType, ElementType, RawMessage, MessageElement, GrayTipElementSubType, GroupNotify, GroupNotifyType, GroupNotifyStatus, FriendRequestNotify, BuddyReqType } from '@/ntqqapi/types'
import type { DirectProtocolClient } from './client'
import type { SsoPacket } from './packet'
import type { Context } from 'cordis'
import { selfInfo } from '@/common/globalVars'
import { ReceiveCmdS } from '@/ntqqapi/hook'

const MSG_PUSH_CMD = 'trpc.msg.olpush.OlPushService.MsgPush'
const KICK_CMD = 'trpc.qq_new_tech.status_svc.StatusService.KickNT'

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

export function startPushDispatcher(ctx: Context, client: DirectProtocolClient) {
  client.on('push', (packet: SsoPacket) => {
    try {
      dispatch(ctx, packet)
    } catch (e) {
      ctx.logger('qqProtocol').warn('Push dispatch error:', (e as Error).message)
    }
  })
}

function dispatch(ctx: Context, packet: SsoPacket) {
  if (packet.cmd === MSG_PUSH_CMD) {
    handleMsgPush(ctx, packet.payload)
  } else if (packet.cmd === KICK_CMD) {
    ctx.parallel('nt/kicked-offLine', { tipsTitle: 'KickNT', tipsDesc: 'Kicked by server' } as any)
  }
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
    default:
      // Forward unknown subtypes to OB11 (e.g. 39 = ProfileLike)
      forwardSystemMessage(ctx, msg)
      break
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

    triggerReceiveHook(ctx, ReceiveCmdS.FRIEND_REQUEST, notify)
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

    triggerReceiveHook(ctx, ReceiveCmdS.UPDATE_MSG, [recallMessage])
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
    case Event0x2DCSub.GeneralEvent:
    case Event0x2DCSub.GroupGrayTip:
    case Event0x2DCSub.GroupEssenceChange:
    default:
      // Forward to OB11 / system-message handler for now
      forwardSystemMessage(ctx, msg)
      break
  }
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

    triggerReceiveHook(ctx, ReceiveCmdS.UPDATE_MSG, [recallMessage])
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

    triggerReceiveHook(ctx, 'nodeIKernelGroupListener/onGroupNotifiesUpdated', [false, [notify]])
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

    triggerReceiveHook(ctx, 'nodeIKernelGroupListener/onGroupNotifiesUpdated', [false, [notify]])
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
  const routingHead = msg.routingHead
  const contentHead = msg.contentHead
  const body = msg.body

  if (!routingHead || !contentHead) return

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

  const rawMessage: RawMessage = {
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

  if (isSelfMsg) {
    triggerReceiveHook(ctx, ReceiveCmdS.SELF_SEND_MSG, rawMessage)
    triggerReceiveHook(ctx, ReceiveCmdS.UPDATE_MSG, [rawMessage])
    return
  }

  triggerReceiveHook(ctx, ReceiveCmdS.NEW_MSG, [rawMessage])
}

function triggerReceiveHook(ctx: Context, cmd: string, payload: any) {
  const qqProtocol = ctx.qqProtocol as any
  if (!qqProtocol?.receiveHooks) return

  for (const hook of qqProtocol.receiveHooks.values()) {
    if (hook.method.includes(cmd)) {
      Promise.resolve(hook.hookFunc(payload))
    }
  }
}

function parseElements(elems: any[]): MessageElement[] {
  const result: any[] = []

  for (const elem of elems) {
    if (!elem) continue

    if (elem.text) {
      const textElem = elem.text
      if (textElem.attr6Buf && textElem.attr6Buf.length > 0) {
        result.push({
          elementType: ElementType.Text,
          elementId: '',
          extBufForUI: '',
          textElement: {
            content: textElem.str || '',
            atType: textElem.attr6Buf[6] === 1 ? 1 : 2,
            atUid: '',
            atNtUid: '',
            atTinyId: '',
            subElementType: 0,
            atChannelId: '',
          },
        })
      } else {
        result.push({
          elementType: ElementType.Text,
          elementId: '',
          extBufForUI: '',
          textElement: {
            content: textElem.str || '',
            atType: 0,
            atUid: '',
            atNtUid: '',
            atTinyId: '',
            subElementType: 0,
            atChannelId: '',
          },
        })
      }
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
    }

    if (elem.richMsg) {
      result.push({
        elementType: ElementType.Ark,
        elementId: '',
        extBufForUI: '',
        arkElement: {
          bytesData: elem.richMsg.template?.toString() || '',
          linkInfo: null,
          subElementType: null,
        },
      })
    }

    if (elem.lightApp) {
      let jsonStr = ''
      if (elem.lightApp.data && elem.lightApp.data.length > 1) {
        try {
          const { unzipSync } = require('node:zlib')
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
    }

    if (elem.commonElem) {
      const svcType = elem.commonElem.serviceType
      const bizType = elem.commonElem.businessType

      if (svcType === 48 && (bizType === 10 || bizType === 20)) {
        result.push({
          elementType: ElementType.Pic,
          elementId: '',
          extBufForUI: '',
          picElement: {
            fileName: '',
            fileSize: '0',
            picWidth: 0,
            picHeight: 0,
            original: false,
            md5HexStr: '',
            sourcePath: '',
            thumbPath: new Map(),
            picType: 0,
            picSubType: 0,
            fileUuid: '',
            fileSubId: '',
            thumbFileSize: 0,
            originImageUrl: '',
          },
        })
      } else if (svcType === 48 && (bizType === 12 || bizType === 22)) {
        result.push({
          elementType: ElementType.Ptt,
          elementId: '',
          extBufForUI: '',
          pttElement: {
            fileName: '',
            filePath: '',
            md5HexStr: '',
            fileSize: '0',
            duration: 0,
            formatType: 1,
            voiceType: 1,
            voiceChangeType: 0,
            canConvert2Text: false,
            fileId: 0,
            fileUuid: '',
            text: '',
          },
        })
      } else if (svcType === 48 && (bizType === 11 || bizType === 21)) {
        result.push({
          elementType: ElementType.Video,
          elementId: '',
          extBufForUI: '',
          videoElement: {
            filePath: '',
            fileName: '',
            videoMd5: '',
            thumbMd5: '',
            fileTime: 0,
            thumbSize: 0,
            fileFormat: 0,
            fileSize: '0',
            thumbWidth: 0,
            thumbHeight: 0,
            busiType: 0,
            subBusiType: 0,
            thumbPath: new Map(),
            transferStatus: 0,
            progress: 0,
            invalidState: 0,
            fileUuid: '',
            fileSubId: '',
            fileBizId: 0,
            originVideoMd5: '',
            import_rich_media_context: null,
            sourceVideoCodecFormat: 0,
          },
        })
      }
    }
  }

  return result
}
