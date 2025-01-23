import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import {
  AtType,
  ChatType,
  GroupMemberRole,
  SendMessageElement,
  ElementType
} from '@/ntqqapi/types'
import {
  OB11MessageData,
  OB11MessageDataType,
  OB11MessageFileBase,
  OB11MessageMixType
} from '../types'
import { decodeCQCode } from '../cqcode'
import { Peer } from '@/ntqqapi/types/msg'
import { SendElement } from '@/ntqqapi/entities'
import { selfInfo } from '@/common/globalVars'
import { uri2local } from '@/common/utils'
import { Context } from 'cordis'
import { MusicSign, MusicSignPostData } from '@/common/utils/sign'

export async function createSendElements(
  ctx: Context,
  messageData: OB11MessageData[],
  peer: Peer,
  ignoreTypes: OB11MessageDataType[] = [],
) {
  const sendElements: SendMessageElement[] = []
  const deleteAfterSentFiles: string[] = []
  for (const segment of messageData) {
    if (ignoreTypes.includes(segment.type)) {
      continue
    }
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
          const atQQ = String(segment.data.qq)
          if (atQQ === 'all') {
            // todo：查询剩余的at全体次数
            const groupCode = peer.peerUid
            let remainAtAllCount = 1
            let isAdmin: boolean = true
            if (groupCode) {
              try {
                remainAtAllCount = (await ctx.ntGroupApi.getGroupRemainAtTimes(groupCode)).atInfo
                  .RemainAtAllCountForUin
                ctx.logger.info(`群${groupCode}剩余at全体次数`, remainAtAllCount)
                const self = await ctx.ntGroupApi.getGroupMember(groupCode, selfInfo.uid)
                isAdmin = self?.role === GroupMemberRole.Admin || self?.role === GroupMemberRole.Owner
              } catch (e) {
              }
            }
            if (isAdmin && remainAtAllCount > 0) {
              sendElements.push(SendElement.at(atQQ, atQQ, AtType.All, '@全体成员'))
            }
          }
          else if (peer.chatType === ChatType.Group) {
            const uid = await ctx.ntUserApi.getUidByUin(atQQ, peer.peerUid) ?? ''
            let display = ''
            if (segment.data.name) {
              display = `@${segment.data.name}`
            }
            sendElements.push(SendElement.at(atQQ, uid, AtType.One, display))
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
          const source = (await ctx.ntMsgApi.getMsgsByMsgId(info.peer, [info.msgId])).msgList[0]
          if (source) {
            sendElements.push(SendElement.reply(source.msgSeq, source.msgId, source.senderUin))
          }
        }
      }
        break
      case OB11MessageDataType.Face: {
        const faceId = segment.data?.id
        if (faceId) {
          sendElements.push(SendElement.face(parseInt(faceId)))
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
          segment.data.summary || '',
          segment.data.subType || 0,
          segment.data.type === 'flash'
        )
        deleteAfterSentFiles.push(res.picElement.sourcePath!)
        sendElements.push(res)
      }
        break
      case OB11MessageDataType.File: {
        const { path, fileName } = await handleOb11RichMedia(ctx, segment, deleteAfterSentFiles)
        sendElements.push(await SendElement.file(ctx, path, fileName))
      }
        break
      case OB11MessageDataType.Video: {
        const { path } = await handleOb11RichMedia(ctx, segment, deleteAfterSentFiles)
        let thumb = segment.data.thumb
        if (thumb) {
          const uri2LocalRes = await uri2local(ctx, thumb)
          if (uri2LocalRes.success) thumb = uri2LocalRes.path
        }
        const res = await SendElement.video(ctx, path, thumb)
        deleteAfterSentFiles.push(res.videoElement.filePath)
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
        const data = type === 'qq' ? ctx.ntFriendApi.getBuddyRecommendContact(id) : ctx.ntGroupApi.getGroupRecommendContact(id)
        sendElements.push(SendElement.ark(await data))
      }
        break
      case OB11MessageDataType.Shake: {
        sendElements.push(SendElement.shake())
      }
        break
      case OB11MessageDataType.Music: {
        const { musicSignUrl } = ctx.config
        if (!musicSignUrl) {
          throw new Error('音乐卡片签名地址未配置')
        }
        const { type } = segment.data
        if (!['qq', '163', 'kugou', 'kuwo', 'migu', 'custom'].includes(type)) {
          throw new Error(`不支持的音乐卡片 type ${type}`)
        }
        if (type === 'custom') {
          if (!segment.data.url) {
            throw new Error('自定义音卡缺少参数url')
          }
          if (!segment.data.title) {
            throw new Error('自定义音卡缺少参数title')
          }
        } else {
          if (!segment.data.id) {
            throw new Error('音乐卡片缺少id参数')
          }
        }
        let postData: MusicSignPostData
        if (type === 'custom' && segment.data.content) {
          const { content, ...others } = segment.data
          postData = { singer: content, ...others }
        } else {
          postData = segment.data
        }
        try {
          const content = await new MusicSign(ctx, musicSignUrl).sign(postData)
          if (!content) {
            throw new Error('提交内容有误或者签名服务器签名失败')
          }
          sendElements.push(SendElement.ark(content))
        } catch (e) {
          throw new Error(`签名音乐消息失败：${e}`)
        }
      }
        break
    }
  }

  return {
    sendElements,
    deleteAfterSentFiles,
  }
}

export function message2List(message: OB11MessageMixType, autoEscape = false) {
  if (typeof message === 'string') {
    if (autoEscape === true) {
      return [
        {
          type: OB11MessageDataType.Text,
          data: {
            text: message,
          },
        },
      ] as OB11MessageData[]
    } else {
      return decodeCQCode(message)
    }
  } else if (!Array.isArray(message)) {
    return [message]
  }
  return message
}

export async function sendMsg(
  ctx: Context,
  peer: Peer,
  sendElements: SendMessageElement[],
  deleteAfterSentFiles: string[]
) {
  if (peer.chatType === ChatType.Group) {
    const info = await ctx.ntGroupApi.getGroupAllInfo(peer.peerUid)
      .catch(() => undefined)
    const shutUpMeTimestamp = info?.groupAll.shutUpMeTimestamp
    if (shutUpMeTimestamp && shutUpMeTimestamp * 1000 > Date.now()) {
      throw new Error('当前处于被禁言状态')
    }
  }
  if (!sendElements.length) {
    throw new Error('消息体无法解析，请检查是否发送了不支持的消息类型')
  }
  // 计算发送的文件大小
  let totalSize = 0
  for (const fileElement of sendElements) {
    try {
      if (fileElement.elementType === ElementType.Ptt) {
        totalSize += fs.statSync(fileElement.pttElement.filePath!).size
      }
      if (fileElement.elementType === ElementType.File) {
        totalSize += fs.statSync(fileElement.fileElement.filePath!).size
      }
      if (fileElement.elementType === ElementType.Video) {
        totalSize += fs.statSync(fileElement.videoElement.filePath).size
      }
      if (fileElement.elementType === ElementType.Pic) {
        totalSize += fs.statSync(fileElement.picElement.sourcePath!).size
      }
    } catch (e) {
      ctx.logger.warn('文件大小计算失败', e, fileElement)
    }
  }
  //log('发送消息总大小', totalSize, 'bytes')
  const timeout = 10000 + (totalSize / 1024 / 256 * 1000)  // 10s Basic Timeout + PredictTime( For File 512kb/s )
  //log('设置消息超时时间', timeout)
  const returnMsg = await ctx.ntMsgApi.sendMsg(peer, sendElements, timeout)
  if (returnMsg) {
    ctx.logger.info('消息发送', peer)
    deleteAfterSentFiles.map(path => fsPromise.unlink(path))
    return returnMsg
  }
}

export interface CreatePeerPayload {
  group_id?: string | number
  user_id?: string | number
}

export enum CreatePeerMode {
  Normal = 0,
  Private = 1,
  Group = 2
}

export async function createPeer(ctx: Context, payload: CreatePeerPayload, mode = CreatePeerMode.Normal): Promise<Peer> {
  if ((mode === CreatePeerMode.Group || mode === CreatePeerMode.Normal) && payload.group_id) {
    return {
      chatType: ChatType.Group,
      peerUid: payload.group_id.toString(),
    }
  }
  if ((mode === CreatePeerMode.Private || mode === CreatePeerMode.Normal) && payload.user_id) {
    const uid = await ctx.ntUserApi.getUidByUin(payload.user_id.toString())
    if (!uid) throw new Error('无法获取用户信息')
    const isBuddy = await ctx.ntFriendApi.isBuddy(uid)
    return {
      chatType: isBuddy ? ChatType.C2C : ChatType.TempC2CFromGroup,
      peerUid: uid,
    }
  }
  throw new Error('请指定 group_id 或 user_id')
}

export async function handleOb11RichMedia(ctx: Context, segment: OB11MessageFileBase, deleteAfterSentFiles: string[]) {
  const res = await uri2local(ctx, segment.data.url || segment.data.file)

  if (!res.success) {
    ctx.logger.error(res.errMsg)
    throw Error(res.errMsg)
  }

  if (!res.isLocal) {
    deleteAfterSentFiles.push(res.path)
  }

  return { path: res.path, fileName: segment.data.name || res.fileName }
}
