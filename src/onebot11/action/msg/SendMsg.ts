import {
  ChatType,
  ElementType,
  RawMessage,
  SendMessageElement,
} from '@/ntqqapi/types'
import {
  OB11MessageCustomMusic,
  OB11MessageData,
  OB11MessageDataType,
  OB11MessageJson,
  OB11MessageMusic,
  OB11MessageNode,
  OB11PostSendMsg,
} from '../../types'
import fs from 'node:fs'
import BaseAction from '../BaseAction'
import { ActionName, BaseCheckResult } from '../types'
import { CustomMusicSignPostData, IdMusicSignPostData, MusicSign, MusicSignPostData } from '@/common/utils/sign'
import { Peer } from '@/ntqqapi/types/msg'
import { MessageUnique } from '@/common/utils/messageUnique'
import { selfInfo } from '@/common/globalVars'
import { convertMessage2List, createSendElements, sendMsg, createPeer, CreatePeerMode } from '../../helper/createMessage'

interface ReturnData {
  message_id: number
}

export class SendMsg extends BaseAction<OB11PostSendMsg, ReturnData> {
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
    return {
      valid: true,
    }
  }

  protected async _handle(payload: OB11PostSendMsg) {
    let contextMode = CreatePeerMode.Normal
    if (payload.message_type === 'group') {
      contextMode = CreatePeerMode.Group
    } else if (payload.message_type === 'private') {
      contextMode = CreatePeerMode.Private
    }
    const peer = await createPeer(this.ctx, payload, contextMode)
    const messages = convertMessage2List(
      payload.message,
      payload.auto_escape === true || payload.auto_escape === 'true',
    )
    if (this.getSpecialMsgNum(messages, OB11MessageDataType.node)) {
      try {
        const returnMsg = await this.handleForwardNode(peer, messages as OB11MessageNode[])
        return { message_id: returnMsg.msgShortId! }
      } catch (e) {
        throw '发送转发消息失败 ' + e
      }
    }
    else if (this.getSpecialMsgNum(messages, OB11MessageDataType.music)) {
      const music = messages[0] as OB11MessageMusic
      if (music) {
        const { musicSignUrl } = this.adapter.config
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
          jsonContent = await new MusicSign(this.ctx, musicSignUrl).sign(postData)
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
    const { sendElements, deleteAfterSentFiles } = await createSendElements(this.ctx, messages, peer)
    if (sendElements.length === 1) {
      if (sendElements[0] === null) {
        return { message_id: 0 }
      }
    }
    const returnMsg = await sendMsg(this.ctx, peer, sendElements, deleteAfterSentFiles)
    if (!returnMsg) {
      throw new Error('消息发送失败')
    }
    return { message_id: returnMsg.msgShortId! }
  }

  private getSpecialMsgNum(message: OB11MessageData[], msgType: OB11MessageDataType): number {
    if (Array.isArray(message)) {
      return message.filter((msg) => msg.type == msgType).length
    }
    return 0
  }

  private async cloneMsg(msg: RawMessage): Promise<RawMessage | undefined> {
    this.ctx.logger.info('克隆的目标消息', msg)
    const sendElements: SendMessageElement[] = []
    for (const ele of msg.elements) {
      sendElements.push(ele as SendMessageElement)
    }
    if (sendElements.length === 0) {
      this.ctx.logger.warn('需要clone的消息无法解析，将会忽略掉', msg)
    }
    this.ctx.logger.info('克隆消息', sendElements)
    try {
      const peer = {
        chatType: ChatType.friend,
        peerUid: selfInfo.uid
      }
      const nodeMsg = await this.ctx.ntMsgApi.sendMsg(peer, sendElements)
      await this.ctx.sleep(400)
      return nodeMsg
    } catch (e) {
      this.ctx.logger.warn(e, '克隆转发消息失败,将忽略本条消息', msg)
    }
  }

  // 返回一个合并转发的消息id
  private async handleForwardNode(destPeer: Peer, messageNodes: OB11MessageNode[]) {
    const selfPeer = {
      chatType: ChatType.friend,
      peerUid: selfInfo.uid,
    }
    let nodeMsgIds: string[] = []
    // 先判断一遍是不是id和自定义混用
    for (const messageNode of messageNodes) {
      // 一个node表示一个人的消息
      const nodeId = messageNode.data.id
      // 有nodeId表示一个子转发消息卡片
      if (nodeId) {
        const nodeMsg = await MessageUnique.getMsgIdAndPeerByShortId(+nodeId) || await MessageUnique.getPeerByMsgId(nodeId)
        if (!nodeMsg) {
          this.ctx.logger.warn('转发消息失败，未找到消息', nodeId)
          continue
        }
        nodeMsgIds.push(nodeMsg.MsgId)
      }
      else {
        // 自定义的消息
        // 提取消息段，发给自己生成消息id
        try {
          const { sendElements, deleteAfterSentFiles } = await createSendElements(
            this.ctx,
            convertMessage2List(messageNode.data.content),
            destPeer
          )
          this.ctx.logger.info('开始生成转发节点', sendElements)
          const sendElementsSplit: SendMessageElement[][] = []
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
            this.ctx.logger.info(sendElementsSplit)
          }
          // log("分割后的转发节点", sendElementsSplit)
          for (const eles of sendElementsSplit) {
            const nodeMsg = await sendMsg(this.ctx, selfPeer, eles, [])
            if (!nodeMsg) {
              this.ctx.logger.warn('转发节点生成失败', eles)
              continue
            }
            nodeMsgIds.push(nodeMsg.msgId)
            await this.ctx.sleep(400)
          }
          deleteAfterSentFiles.map((f) => fs.unlink(f, () => {
          }))
        } catch (e) {
          this.ctx.logger.error('生成转发消息节点失败', e)
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
        const nodeMsg = (await this.ctx.ntMsgApi.getMsgsByMsgId(nodeMsgPeer.Peer, [msgId])).msgList[0]
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
    const returnMsg = await this.ctx.ntMsgApi.multiForwardMsg(srcPeer!, destPeer, nodeMsgIds)
    returnMsg.msgShortId = MessageUnique.createMsg(destPeer, returnMsg.msgId)
    return returnMsg
  }
}

export default SendMsg
