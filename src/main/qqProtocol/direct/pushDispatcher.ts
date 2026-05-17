import { Msg } from '@/ntqqapi/proto'
import { ChatType, ElementType, RawMessage, MessageElement } from '@/ntqqapi/types'
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
  GroupMemberIncrease = 33,
  GroupMemberDecrease = 34,
  GroupAdminChange = 44,
  GroupJoinRequest = 84,
  GroupInvitation = 87,
  Event0x20D = 525,
  Event0x210 = 528,
  Event0x2DC = 732,
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
  console.log(`[PushDispatcher] cmd=${packet.cmd} len=${packet.payload.length}`)
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

  switch (msgType) {
    case MsgType.GroupMessage:
    case MsgType.PrivateMessage:
    case MsgType.TempMessage:
      handleChatMessage(ctx, msg, msgType)
      break

    case MsgType.GroupMemberIncrease:
    case MsgType.GroupMemberDecrease:
    case MsgType.GroupAdminChange:
    case MsgType.Event0x210:
    case MsgType.Event0x2DC:
      handleSystemMessage(ctx, msg, payload)
      break
  }
}

function handleSystemMessage(ctx: Context, _msg: any, rawPayload: Buffer) {
  // Re-encode the Message as protobuf bytes for nt/system-message-created
  // The upper layer (OneBot11 adapter) decodes with Msg.Message.decode(input)
  // and routes by msgType/subType internally
  const pushMsg = Msg.PushMsg.decode(rawPayload)
  const messageBytes = Msg.Message.encode(pushMsg.message)
  ctx.parallel('nt/system-message-created', Buffer.from(messageBytes))
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

  const rawMessage: RawMessage = {
    msgId: String(contentHead.msgUid || contentHead.msgSeq || Date.now()),
    msgType: 2,
    subMsgType: 0,
    msgTime: String(contentHead.msgTime || Math.floor(Date.now() / 1000)),
    msgSeq: String(contentHead.msgSeq || 0),
    msgRandom: String(contentHead.random || 0),
    senderUid: routingHead.fromUid || '',
    senderUin: String(routingHead.fromUin || 0),
    peerUid,
    peerUin,
    guildId: '',
    sendNickName: routingHead.c2c?.friendName || sendMemberName || '',
    sendMemberName,
    sendRemarkName: '',
    chatType,
    sendStatus: 0,
    recallTime: '0',
    records: [],
    elements,
    peerName: routingHead.group?.groupName || '',
    emojiLikesList: [],
    msgAttrs: new Map(),
    isOnlineMsg: true,
  }

  // Skip self-sent messages
  if (rawMessage.senderUin === selfInfo.uin) return

  console.log(`[QQ Server] Message from ${rawMessage.senderUin} in ${chatType === ChatType.Group ? 'group ' + peerUin : 'private'}: ${elements.filter(e => e.textElement).map(e => e.textElement?.content).join('')}`)

  triggerReceiveHook(ctx, ReceiveCmdS.NEW_MSG, [rawMessage])
}

function triggerReceiveHook(ctx: Context, cmd: string, payload: any) {
  const qqProtocol = ctx.qqProtocol as any
  if (!qqProtocol?.receiveHooks) {
    console.log(`[PushDispatcher] No receiveHooks, emitting directly`)
    if (cmd === ReceiveCmdS.NEW_MSG) {
      for (const msg of payload as RawMessage[]) {
        ctx.parallel('nt/message-created', msg)
      }
    }
    return
  }

  let triggered = 0
  for (const hook of qqProtocol.receiveHooks.values()) {
    if (hook.method.includes(cmd)) {
      triggered++
      Promise.resolve(hook.hookFunc(payload))
    }
  }
  console.log(`[PushDispatcher] Triggered ${triggered} hooks for ${cmd}`)
}

function parseElements(elems: any[]): MessageElement[] {
  const result: any[] = []

  for (const elem of elems) {
    if (!elem) continue

    if (elem.text) {
      const textElem = elem.text
      if (textElem.attr6Buf && textElem.attr6Buf.length > 0) {
        // @ mention
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

    // CommonElem with serviceType 48 = multimedia (image/video/record)
    if (elem.commonElem) {
      const svcType = elem.commonElem.serviceType
      const bizType = elem.commonElem.businessType

      if (svcType === 48 && (bizType === 10 || bizType === 20)) {
        // Image
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
        // Voice/Record
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
        // Video
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
