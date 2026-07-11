import {
  AtType,
  ChatType,
  FaceType,
  GroupMemberRole,
  SendMessageElement,
} from '@/ntqqapi/types'
import {
  OB11MessageData,
  OB11MessageDataType,
  OB11MessageFileBase,
} from '../../types'
import { ElementType, Peer } from '@/ntqqapi/types/msg'
import { SendElement } from '@/ntqqapi/entities'
import { selfInfo } from '@/common/globalVars'
import { uri2local } from '@/common/utils'
import { Context } from 'cordis'
import { MusicSign } from '@/common/utils/sign'
import { randomUUID } from 'node:crypto'
import { message2List } from '@/onebot11/utils'

export async function transformOutgoingSegments(
  ctx: Context,
  messageData: OB11MessageData[],
  peer: Peer,
  isInsideForward: boolean
) {
  const sendElements: SendMessageElement[] = []
  const deleteAfterSentFiles: string[] = []
  const nodes: {
    senderUin: number
    senderName: string
    elements: SendMessageElement[]
    msgTime?: number
  }[] = []

  for (const segment of messageData) {
    switch (segment.type) {
      case OB11MessageDataType.Text: {
        const text = segment.data?.text
        if (text) {
          sendElements.push(SendElement.text(segment.data!.text))
        }
      }
        break
      case OB11MessageDataType.At: {
        if (!peer) {
          continue
        }
        if (segment.data?.qq) {
          if (segment.data.qq === 'all') {
            const groupCode = peer.peerUid
            let remainAtAllCount = 1
            let isAdmin: boolean = true
            if (groupCode) {
              try {
                remainAtAllCount = (await ctx.ntGroupApi.getGroupRemainAtTimes(+groupCode))
                  .remainAtAllCountForUin
                ctx.logger.info(`群${groupCode}剩余at全体次数`, remainAtAllCount)
                const self = await ctx.ntGroupApi.getGroupMemberByUid(+groupCode, selfInfo.uid, false)
                isAdmin = self?.role === GroupMemberRole.Admin || self?.role === GroupMemberRole.Owner
              } catch (e) {
              }
            }
            if (isAdmin && remainAtAllCount > 0) {
              sendElements.push(SendElement.at(0, AtType.All, '@全体成员'))
            }
          }
          else if (peer.chatType === ChatType.Group) {
            const uin = +segment.data.qq
            let display
            if (segment.data.name) {
              display = `@${segment.data.name}`
            } else {
              const info = await ctx.ntGroupApi.getGroupMemberByUin(+peer.peerUid, uin, false)
              display = `@${info?.cardName || info?.nick || ''}`
            }
            sendElements.push(SendElement.at(uin, AtType.One, display))
          }
        }
      }
        break
      case OB11MessageDataType.Reply: {
        if (segment.data?.id) {
          const info = await ctx.store.getMsgInfoByShortId(+segment.data.id)
          if (!info) {
            ctx.logger.warn('回复消息不存在', info)
            continue
          }
          let msg = ctx.store.getMsgByMsgId(info.msgId)
          let srcMsg
          if (!msg) {
            const { msgList, msgByteList } = await ctx.ntMsgApi.getSingleMsg(info.peer, info.msgSeq)
            msg = msgList[0]
            if (isInsideForward) {
              srcMsg = msgByteList[0]
            }
          }
          if (msg) {
            if (isInsideForward && !srcMsg) {
              const { msgByteList } = await ctx.ntMsgApi.getSingleMsg(info.peer, info.msgSeq)
              srcMsg = msgByteList[0]
            }
            sendElements.push(SendElement.reply(
              msg.msgSeq,
              msg.senderUin,
              msg.senderUid,
              msg.msgTime,
              msg.clientSeq,
              srcMsg
            ))
          }
        }
      }
        break
      case OB11MessageDataType.Face: {
        const faceId = segment.data?.id
        const faceType: FaceType | undefined = segment.data?.sub_type
        if (faceId) {
          sendElements.push(SendElement.face(+faceId, faceType))
        }
      }
        break
      case OB11MessageDataType.Mface: {
        sendElements.push(
          SendElement.mface(
            +segment.data.emoji_package_id,
            segment.data.emoji_id,
            segment.data.key,
            segment.data.summary,
          ),
        )
      }
        break
      case OB11MessageDataType.Image: {
        const res = await SendElement.pic(
          ctx,
          (await handleOb11RichMedia(ctx, segment, deleteAfterSentFiles)).path,
          segment.data.summary ?? '',
          Number(segment.data.subType) || 0
        )
        sendElements.push(res)
      }
        break
      case OB11MessageDataType.Video: {
        const { path } = await handleOb11RichMedia(ctx, segment, deleteAfterSentFiles)
        let thumb = segment.data.cover ?? segment.data.thumb
        if (thumb) {
          const uri2LocalRes = await uri2local(ctx, thumb)
          if (uri2LocalRes.success) {
            if (!uri2LocalRes.isLocal) {
              deleteAfterSentFiles.push(uri2LocalRes.path)
            }
            thumb = uri2LocalRes.path
          } else {
            throw new Error(uri2LocalRes.errMsg)
          }
        }
        const res = await SendElement.video(ctx, path, thumb)
        sendElements.push(res)
      }
        break
      case OB11MessageDataType.Record: {
        const { path } = await handleOb11RichMedia(ctx, segment, deleteAfterSentFiles)
        sendElements.push(await SendElement.ptt(ctx, path))
      }
        break
      case OB11MessageDataType.Json: {
        sendElements.push(SendElement.ark(segment.data.data))
      }
        break
      case OB11MessageDataType.Dice: {
        const resultId = segment.data?.result
        sendElements.push(SendElement.dice(resultId))
      }
        break
      case OB11MessageDataType.Rps: {
        const resultId = segment.data?.result
        sendElements.push(SendElement.rps(resultId))
      }
        break
      case OB11MessageDataType.Contact: {
        const { type, id } = segment.data
        const data = type === 'qq' ? ctx.ntFriendApi.getFriendRecommendContactArk(+id) : ctx.ntGroupApi.getGroupRecommendContactArk(+id)
        sendElements.push(SendElement.ark(await data))
      }
        break
      case OB11MessageDataType.Shake: {
        sendElements.push(SendElement.shake())
      }
        break
      case OB11MessageDataType.Music: {
        const { musicSignUrl } = ctx.onebot.config
        if (!musicSignUrl) {
          throw new Error('音乐卡片签名地址未配置')
        }
        const { type } = segment.data
        if (!['qq', '163', 'kugou', 'kuwo', 'migu', 'custom'].includes(type)) {
          throw new Error(`不支持的音乐卡片 type ${type}`)
        }
        if (!('id' in segment.data)) {
          if (!segment.data.url) {
            throw new Error('自定义音卡缺少参数url')
          }
          if (!segment.data.title) {
            throw new Error('自定义音卡缺少参数title')
          }
        }
        try {
          const content = await new MusicSign(ctx, musicSignUrl).sign(segment.data)
          sendElements.push(SendElement.ark(content))
        } catch (e) {
          throw new Error(`签名音乐消息失败：${(e as Error).message}`)
        }
      }
        break
      case OB11MessageDataType.Forward: {
        const resid = segment.data.id
        const filename = randomUUID()
        const { msgList } = await ctx.ntMsgApi.getForwardedMsgs(resid)
        if (msgList.length === 0) {
          continue
        }
        const source = msgList[0].chatType === ChatType.Group ?
          '群聊的聊天记录' : '聊天记录'
        const summary = `查看${msgList.length}条转发消息`
        const news = []
        for (const msg of msgList) {
          if (news.length === 4) continue
          const content = msg.elements.reduce((acc, curr) => {
            let preview
            if (curr.elementType === ElementType.Text) {
              preview = curr.textElement!.content.slice(0, 70)
            } else if (curr.elementType === ElementType.Face) {
              preview = curr.faceElement!.faceText
            } else if (curr.elementType === ElementType.MarketFace) {
              preview = curr.marketFaceElement!.faceName
            } else if (curr.elementType === ElementType.Pic) {
              preview = curr.picElement!.summary || '[图片]'
            } else if (curr.elementType === ElementType.Video) {
              preview = '[视频]'
            } else if (curr.elementType === ElementType.Ptt) {
              preview = '[语音]'
            } else if (curr.elementType === ElementType.Ark) {
              const match = curr.arkElement!.bytesData!.match(/"prompt"\s*:\s*"([^"]*)"/)
              preview = match?.[1] ?? ''
            } else if (curr.elementType === ElementType.MultiForward) {
              preview = '[合并转发]'
            }
            return acc + preview
          }, '')
          news.push({ text: `${msg.sendNickName}: ${content}` })
        }
        const content = JSON.stringify({
          app: 'com.tencent.multimsg',
          config: {
            autosize: 1,
            forward: 1,
            round: 1,
            type: 'normal',
            width: 300
          },
          desc: '[聊天记录]',
          extra: JSON.stringify({
            filename,
            tsum: 0,
          }),
          meta: {
            detail: {
              news,
              resid,
              source,
              summary,
              uniseq: filename,
            }
          },
          prompt: '[聊天记录]',
          ver: '0.0.0.5',
          view: 'contact'
        })
        sendElements.push(SendElement.ark(content))
      }
        break
      case OB11MessageDataType.Node: {
        const content = segment.data.content ? message2List(segment.data.content) : []
        const inner = await transformOutgoingSegments(ctx, content, peer, true)
        deleteAfterSentFiles.push(...inner.deleteAfterSentFiles)
        nodes.push({
          senderUin: Number(segment.data.uin ?? segment.data.user_id ?? selfInfo.uin),
          senderName: segment.data.name ?? segment.data.nickname ?? selfInfo.nick,
          elements: inner.sendElements,
          msgTime: segment.data.time ? +segment.data.time : undefined
        })
      }
        break
      case OB11MessageDataType.File: {
        const { path, fileName } = await handleOb11RichMedia(ctx, segment, deleteAfterSentFiles)
        sendElements.push(await SendElement.file(ctx, path, fileName))
      }
        break
    }
  }

  if (nodes.length > 0) {
    sendElements.push(SendElement.forward(nodes))
  }

  return {
    sendElements,
    deleteAfterSentFiles,
  }
}

async function handleOb11RichMedia(ctx: Context, segment: OB11MessageFileBase, deleteAfterSentFiles: string[]) {
  const res = await uri2local(ctx, segment.data.url || segment.data.file)

  if (!res.success) {
    throw new Error(res.errMsg)
  }

  if (!res.isLocal) {
    deleteAfterSentFiles.push(res.path)
  }

  return { path: res.path, fileName: segment.data.name || res.fileName }
}
