import {
  AtType,
  ChatType,
  ElementType,
  GroupMemberRole,
  RawMessage,
  SendMessageElement,
} from '@/ntqqapi/types'
import { getGroupMember, getSelfUid, getSelfUin } from '@/common/data'
import {
  OB11MessageCustomMusic,
  OB11MessageData,
  OB11MessageDataType,
  OB11MessageJson,
  OB11MessageMixType,
  OB11MessageMusic,
  OB11MessageNode,
  OB11PostSendMsg,
} from '../../types'
import { SendMsgElementConstructor } from '@/ntqqapi/constructor'
import BaseAction from '../BaseAction'
import { ActionName, BaseCheckResult } from '../types'
import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import { decodeCQCode } from '../../cqcode'
import { getConfigUtil } from '@/common/config'
import { log } from '@/common/utils/log'
import { sleep } from '@/common/utils/helper'
import { uri2local } from '@/common/utils'
import { NTQQGroupApi, NTQQMsgApi, NTQQUserApi, NTQQFriendApi } from '@/ntqqapi/api'
import { CustomMusicSignPostData, IdMusicSignPostData, MusicSign, MusicSignPostData } from '@/common/utils/sign'
import { Peer } from '@/ntqqapi/types/msg'
import { MessageUnique } from '@/common/utils/MessageUnique'
import { OB11MessageFileBase } from '../../types'

export interface ReturnDataType {
  message_id: number
}

export enum ContextMode {
  Normal = 0,
  Private = 1,
  Group = 2
}

interface MessageContext {
  deleteAfterSentFiles: string[]
  peer: Peer
}

export function convertMessage2List(message: OB11MessageMixType, autoEscape = false) {
  if (typeof message === 'string') {
    if (autoEscape === true) {
      message = [
        {
          type: OB11MessageDataType.text,
          data: {
            text: message,
          },
        },
      ]
    }
    else {
      message = decodeCQCode(message.toString())
    }
  }
  else if (!Array.isArray(message)) {
    message = [message]
  }
  return message
}

// forked from https://github.com/NapNeko/NapCatQQ/blob/6f6b258f22d7563f15d84e7172c4d4cbb547f47e/src/onebot11/action/msg/SendMsg/create-send-elements.ts#L26
async function handleOb11FileLikeMessage(
  { data: inputdata }: OB11MessageFileBase,
  { deleteAfterSentFiles }: Pick<MessageContext, 'deleteAfterSentFiles'>,
) {
  //有的奇怪的框架将url作为参数 而不是file 此时优先url 同时注意可能传入的是非file://开头的目录 By Mlikiowa
  const {
    path,
    isLocal,
    fileName,
    errMsg,
    success,
  } = (await uri2local(inputdata?.url || inputdata.file))

  if (!success) {
    log('文件下载失败', errMsg)
    throw Error('文件下载失败' + errMsg)
  }

  if (!isLocal) { // 只删除http和base64转过来的文件
    deleteAfterSentFiles.push(path)
  }

  return { path, fileName: inputdata.name || fileName }
}

export async function createSendElements(
  messageData: OB11MessageData[],
  peer: Peer,
  ignoreTypes: OB11MessageDataType[] = [],
) {
  let sendElements: SendMessageElement[] = []
  let deleteAfterSentFiles: string[] = []
  for (let sendMsg of messageData) {
    if (ignoreTypes.includes(sendMsg.type)) {
      continue
    }
    switch (sendMsg.type) {
      case OB11MessageDataType.text: {
        const text = sendMsg.data?.text
        if (text) {
          sendElements.push(SendMsgElementConstructor.text(sendMsg.data!.text))
        }
      }
        break
      case OB11MessageDataType.at: {
        if (!peer) {
          continue
        }
        if (sendMsg.data?.qq) {
          const atQQ = String(sendMsg.data.qq)
          if (atQQ === 'all') {
            // todo：查询剩余的at全体次数
            const groupCode = peer.peerUid
            let remainAtAllCount = 1
            let isAdmin: boolean = true
            if (groupCode) {
              try {
                remainAtAllCount = (await NTQQGroupApi.getGroupAtAllRemainCount(groupCode)).atInfo
                  .RemainAtAllCountForUin
                log(`群${groupCode}剩余at全体次数`, remainAtAllCount)
                const self = await getGroupMember(groupCode, getSelfUin())
                isAdmin = self?.role === GroupMemberRole.admin || self?.role === GroupMemberRole.owner
              } catch (e) {
              }
            }
            if (isAdmin && remainAtAllCount > 0) {
              sendElements.push(SendMsgElementConstructor.at(atQQ, atQQ, AtType.atAll, '@全体成员'))
            }
          }
          else if (peer.chatType === ChatType.group) {
            const atMember = await getGroupMember(peer.peerUid, atQQ)
            if (atMember) {
              const display = `@${atMember.cardName || atMember.nick}`
              sendElements.push(
                SendMsgElementConstructor.at(atQQ, atMember.uid, AtType.atUser, display),
              )
            } else {
              const atNmae = sendMsg.data?.name
              const uid = await NTQQUserApi.getUidByUin(atQQ) || ''
              const display = atNmae ? `@${atNmae}` : ''
              sendElements.push(
                SendMsgElementConstructor.at(atQQ, uid, AtType.atUser, display),
              )
            }
          }
        }
      }
        break
      case OB11MessageDataType.reply: {
        if (sendMsg.data?.id) {
          const replyMsgId = await MessageUnique.getMsgIdAndPeerByShortId(+sendMsg.data.id)
          if (!replyMsgId) {
            log('回复消息不存在', replyMsgId)
            continue
          }
          const replyMsg = (await NTQQMsgApi.getMsgsByMsgId(
            replyMsgId.Peer,
            [replyMsgId.MsgId!]
          )).msgList[0]
          if (replyMsg) {
            sendElements.push(
              SendMsgElementConstructor.reply(
                replyMsg.msgSeq,
                replyMsg.msgId,
                replyMsg.senderUin!,
                replyMsg.senderUin!,
              ),
            )
          }
        }
      }
        break
      case OB11MessageDataType.face: {
        const faceId = sendMsg.data?.id
        if (faceId) {
          sendElements.push(SendMsgElementConstructor.face(parseInt(faceId)))
        }
      }
        break
      case OB11MessageDataType.mface: {
        sendElements.push(
          SendMsgElementConstructor.mface(
            sendMsg.data.emoji_package_id,
            sendMsg.data.emoji_id,
            sendMsg.data.key,
            sendMsg.data.summary,
          ),
        )
      }
        break
      case OB11MessageDataType.image: {
        const res = await SendMsgElementConstructor.pic(
          (await handleOb11FileLikeMessage(sendMsg, { deleteAfterSentFiles })).path,
          sendMsg.data.summary || '',
          sendMsg.data.subType || 0
        )
        deleteAfterSentFiles.push(res.picElement.sourcePath)
        sendElements.push(res)
      }
        break
      case OB11MessageDataType.file: {
        const { path, fileName } = await handleOb11FileLikeMessage(sendMsg, { deleteAfterSentFiles })
        sendElements.push(await SendMsgElementConstructor.file(path, fileName))
      }
        break
      case OB11MessageDataType.video: {
        const { path, fileName } = await handleOb11FileLikeMessage(sendMsg, { deleteAfterSentFiles })
        let thumb = sendMsg.data.thumb
        if (thumb) {
          const uri2LocalRes = await uri2local(thumb)
          if (uri2LocalRes.success) thumb = uri2LocalRes.path
        }
        const res = await SendMsgElementConstructor.video(path, fileName, thumb)
        deleteAfterSentFiles.push(res.videoElement.filePath)
        sendElements.push(res)
      }
        break
      case OB11MessageDataType.voice: {
        const { path } = await handleOb11FileLikeMessage(sendMsg, { deleteAfterSentFiles })
        sendElements.push(await SendMsgElementConstructor.ptt(path))
      }
        break
      case OB11MessageDataType.json: {
        sendElements.push(SendMsgElementConstructor.ark(sendMsg.data.data))
      }
        break
      case OB11MessageDataType.poke: {
        let qq = sendMsg.data?.qq || sendMsg.data?.id
      }
        break
      case OB11MessageDataType.dice: {
        const resultId = sendMsg.data?.result
        sendElements.push(SendMsgElementConstructor.dice(resultId))
      }
        break
      case OB11MessageDataType.RPS: {
        const resultId = sendMsg.data?.result
        sendElements.push(SendMsgElementConstructor.rps(resultId))
      }
        break
    }
  }

  return {
    sendElements,
    deleteAfterSentFiles,
  }
}

export async function sendMsg(
  peer: Peer,
  sendElements: SendMessageElement[],
  deleteAfterSentFiles: string[],
  waitComplete = true,
) {
  if (!sendElements.length) {
    throw '消息体无法解析，请检查是否发送了不支持的消息类型'
  }
  // 计算发送的文件大小
  let totalSize = 0
  for (const fileElement of sendElements) {
    try {
      if (fileElement.elementType === ElementType.PTT) {
        totalSize += fs.statSync(fileElement.pttElement.filePath).size
      }
      if (fileElement.elementType === ElementType.FILE) {
        totalSize += fs.statSync(fileElement.fileElement.filePath).size
      }
      if (fileElement.elementType === ElementType.VIDEO) {
        totalSize += fs.statSync(fileElement.videoElement.filePath).size
      }
      if (fileElement.elementType === ElementType.PIC) {
        totalSize += fs.statSync(fileElement.picElement.sourcePath).size
      }
    } catch (e) {
      log('文件大小计算失败', e, fileElement)
    }
  }
  log('发送消息总大小', totalSize, 'bytes')
  let timeout = ((totalSize / 1024 / 100) * 1000) + 5000  // 100kb/s
  log('设置消息超时时间', timeout)
  const returnMsg = await NTQQMsgApi.sendMsg(peer, sendElements, waitComplete, timeout)
  log('消息发送结果', returnMsg)
  returnMsg.msgShortId = MessageUnique.createMsg(peer, returnMsg.msgId)
  deleteAfterSentFiles.map(path => fsPromise.unlink(path))
  return returnMsg
}

async function createContext(payload: OB11PostSendMsg, contextMode: ContextMode): Promise<Peer> {
  // This function determines the type of message by the existence of user_id / group_id,
  // not message_type.
  // This redundant design of Ob11 here should be blamed.

  if ((contextMode === ContextMode.Group || contextMode === ContextMode.Normal) && payload.group_id) {
    return {
      chatType: ChatType.group,
      peerUid: payload.group_id.toString(),
    }
  }
  if ((contextMode === ContextMode.Private || contextMode === ContextMode.Normal) && payload.user_id) {
    const Uid = await NTQQUserApi.getUidByUin(payload.user_id.toString())
    const isBuddy = await NTQQFriendApi.isBuddy(Uid!)
    //console.log("[调试代码] UIN:", payload.user_id, " UID:", Uid, " IsBuddy:", isBuddy)
    return {
      chatType: isBuddy ? ChatType.friend : ChatType.temp,
      peerUid: Uid!,
      guildId: payload.group_id?.toString() || '' //临时主动发起时需要传入群号
    }
  }
  throw '请指定 group_id 或 user_id'
}

export class SendMsg extends BaseAction<OB11PostSendMsg, ReturnDataType> {
  actionName = ActionName.SendMsg

  protected async check(payload: OB11PostSendMsg): Promise<BaseCheckResult> {
    const messages = convertMessage2List(payload.message)
    const fmNum = this.getSpecialMsgNum(messages, OB11MessageDataType.node)
    if (fmNum && fmNum != messages.length) {
      return {
        valid: false,
        message: '转发消息不能和普通消息混在一起发送,转发需要保证message只有type为node的元素',
      }
    }
    const musicNum = this.getSpecialMsgNum(messages, OB11MessageDataType.music)
    if (musicNum && messages.length > 1) {
      return {
        valid: false,
        message: '音乐消息不可以和其他消息混在一起发送',
      }
    }
    if (payload.user_id && payload.message_type !== 'group') {
      const uid = await NTQQUserApi.getUidByUin(payload.user_id.toString())
      const isBuddy = await NTQQFriendApi.isBuddy(uid!)
      // 此处有问题
      if (!isBuddy) {
        //return { valid: false, message: '异常消息' }
      }
    }
    return {
      valid: true,
    }
  }

  protected async _handle(payload: OB11PostSendMsg) {
    const peer = await createContext(payload, ContextMode.Normal)
    const messages = convertMessage2List(
      payload.message,
      payload.auto_escape === true || payload.auto_escape === 'true',
    )
    if (this.getSpecialMsgNum(messages, OB11MessageDataType.node)) {
      try {
        const returnMsg = await this.handleForwardNode(peer, messages as OB11MessageNode[])
        return { message_id: returnMsg?.msgShortId! }
      } catch (e: any) {
        throw '发送转发消息失败 ' + e.toString()
      }
    }
    else if (this.getSpecialMsgNum(messages, OB11MessageDataType.music)) {
      const music = messages[0] as OB11MessageMusic
      if (music) {
        const { musicSignUrl } = getConfigUtil().getConfig()
        if (!musicSignUrl) {
          throw '音乐签名地址未配置'
        }
        const { type } = music.data
        if (!['qq', '163', 'custom'].includes(type)) {
          throw `不支持的音乐类型 ${type}`
        }
        const postData: MusicSignPostData = { ...music.data }
        if (type === 'custom' && music.data.content) {
          const data = postData as CustomMusicSignPostData
          data.singer = music.data.content
          delete (data as OB11MessageCustomMusic['data']).content
        }
        if (type === 'custom') {
          const customMusicData = music.data as CustomMusicSignPostData
          if (!customMusicData.url) {
            throw '自定义音卡缺少参数url'
          }
          if (!customMusicData.audio) {
            throw '自定义音卡缺少参数audio'
          }
          if (!customMusicData.title) {
            throw '自定义音卡缺少参数title'
          }
        }
        if (type === 'qq' || type === '163') {
          const idMusicData = music.data as IdMusicSignPostData
          if (!idMusicData.id) {
            throw '音乐卡片缺少id参数'
          }
        }
        let jsonContent: string
        try {
          jsonContent = await new MusicSign(musicSignUrl).sign(postData)
          if (!jsonContent) {
            throw '音乐消息生成失败，提交内容有误或者签名服务器签名失败'
          }
        } catch (e) {
          throw `签名音乐消息失败：${e}`
        }
        messages[0] = {
          type: OB11MessageDataType.json,
          data: { data: jsonContent },
        } as OB11MessageJson
      }
    }
    // log("send msg:", peer, sendElements)
    const { sendElements, deleteAfterSentFiles } = await createSendElements(messages, peer)
    if (sendElements.length === 1) {
      if (sendElements[0] === null) {
        return { message_id: 0 }
      }
    }
    const returnMsg = await sendMsg(peer, sendElements, deleteAfterSentFiles)
    return { message_id: returnMsg.msgShortId! }
  }

  private getSpecialMsgNum(message: OB11MessageData[], msgType: OB11MessageDataType): number {
    if (Array.isArray(message)) {
      return message.filter((msg) => msg.type == msgType).length
    }
    return 0
  }

  private async cloneMsg(msg: RawMessage): Promise<RawMessage | undefined> {
    log('克隆的目标消息', msg)
    let sendElements: SendMessageElement[] = []
    for (const ele of msg.elements) {
      sendElements.push(ele as SendMessageElement)
      // Object.keys(ele).forEach((eleKey) => {
      //     if (eleKey.endsWith("Element")) {
      //     }
    }
    if (sendElements.length === 0) {
      log('需要clone的消息无法解析，将会忽略掉', msg)
    }
    log('克隆消息', sendElements)
    try {
      const nodeMsg = await NTQQMsgApi.sendMsg(
        {
          chatType: ChatType.friend,
          peerUid: getSelfUid(),
        },
        sendElements,
        true,
      )
      await sleep(400)
      return nodeMsg
    } catch (e) {
      log(e, '克隆转发消息失败,将忽略本条消息', msg)
    }
  }

  // 返回一个合并转发的消息id
  private async handleForwardNode(destPeer: Peer, messageNodes: OB11MessageNode[]) {
    const selfPeer = {
      chatType: ChatType.friend,
      peerUid: getSelfUid(),
    }
    let nodeMsgIds: string[] = []
    // 先判断一遍是不是id和自定义混用
    for (const messageNode of messageNodes) {
      // 一个node表示一个人的消息
      let nodeId = messageNode.data.id
      // 有nodeId表示一个子转发消息卡片
      if (nodeId) {
        const nodeMsg = await MessageUnique.getMsgIdAndPeerByShortId(+nodeId) || await MessageUnique.getPeerByMsgId(nodeId)
        if (!nodeMsg) {
          log('转发消息失败，未找到消息', nodeId)
          continue
        }
        nodeMsgIds.push(nodeMsg.MsgId)
      }
      else {
        // 自定义的消息
        // 提取消息段，发给自己生成消息id
        try {
          const { sendElements, deleteAfterSentFiles } = await createSendElements(
            convertMessage2List(messageNode.data.content),
            destPeer
          )
          log('开始生成转发节点', sendElements)
          let sendElementsSplit: SendMessageElement[][] = []
          let splitIndex = 0
          for (const ele of sendElements) {
            if (!sendElementsSplit[splitIndex]) {
              sendElementsSplit[splitIndex] = []
            }

            if (ele.elementType === ElementType.FILE || ele.elementType === ElementType.VIDEO) {
              if (sendElementsSplit[splitIndex].length > 0) {
                splitIndex++
              }
              sendElementsSplit[splitIndex] = [ele]
              splitIndex++
            }
            else {
              sendElementsSplit[splitIndex].push(ele)
            }
            log(sendElementsSplit)
          }
          // log("分割后的转发节点", sendElementsSplit)
          for (const eles of sendElementsSplit) {
            const nodeMsg = await sendMsg(selfPeer, eles, [], true)
            nodeMsgIds.push(nodeMsg.msgId)
            await sleep(400)
            log('转发节点生成成功', nodeMsg.msgId)
          }
          deleteAfterSentFiles.map((f) => fs.unlink(f, () => {
          }))
        } catch (e) {
          log('生成转发消息节点失败', e)
        }
      }
    }

    // 检查srcPeer是否一致，不一致则需要克隆成自己的消息, 让所有srcPeer都变成自己的，使其保持一致才能够转发
    const nodeMsgArray: RawMessage[] = []
    let srcPeer: Peer | null = null
    let needSendSelf = false
    for (const msgId of nodeMsgIds) {
      const nodeMsgPeer = await MessageUnique.getPeerByMsgId(msgId)
      if (nodeMsgPeer) {
        const nodeMsg = (await NTQQMsgApi.getMsgsByMsgId(nodeMsgPeer.Peer, [msgId])).msgList[0]
        srcPeer = srcPeer ?? { chatType: nodeMsg.chatType, peerUid: nodeMsg.peerUid }
        if (srcPeer.peerUid !== nodeMsg.peerUid) {
          needSendSelf = true
        }
        nodeMsgArray.push(nodeMsg)
      }
    }
    nodeMsgIds = nodeMsgArray.map((msg) => msg.msgId)
    if (needSendSelf) {
      for (const msg of nodeMsgArray) {
        if (msg.peerUid === selfPeer.peerUid) continue
        await this.cloneMsg(msg)
      }
    }
    // elements之间用换行符分隔
    // let _sendForwardElements: SendMessageElement[] = []
    // for(let i = 0; i < sendForwardElements.length; i++){
    //     _sendForwardElements.push(sendForwardElements[i])
    //     _sendForwardElements.push(SendMsgElementConstructor.text("\n\n"))
    // }
    // const nodeMsg = await NTQQApi.sendMsg(selfPeer, _sendForwardElements, true);
    // nodeIds.push(nodeMsg.msgId)
    // await sleep(500);
    // 开发转发
    if (nodeMsgIds.length === 0) {
      throw Error('转发消息失败，节点为空')
    }
    const returnMsg = await NTQQMsgApi.multiForwardMsg(srcPeer!, destPeer, nodeMsgIds)
    returnMsg.msgShortId = MessageUnique.createMsg(destPeer, returnMsg.msgId)
    return returnMsg
  }
}

export default SendMsg
