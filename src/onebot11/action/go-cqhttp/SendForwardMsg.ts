import { unlink } from 'node:fs/promises'
import { OB11MessageData, OB11MessageNode } from '../../types'
import { ActionName } from '../types'
import { BaseAction, Schema } from '../BaseAction'
import { Peer } from '@/ntqqapi/types/msg'
import { ChatType, ElementType, RawMessage, SendMessageElement } from '@/ntqqapi/types'
import { selfInfo } from '@/common/globalVars'
import { message2List, createSendElements, createPeer, CreatePeerMode } from '../../helper/createMessage'
import { MessageEncoder } from '@/onebot11/helper/createMultiMessage'
import { Msg } from '@/ntqqapi/proto/compiled'

interface Payload {
  user_id?: string | number
  group_id?: string | number
  messages?: OB11MessageNode[]
  message?: OB11MessageNode[]
  message_type?: 'group' | 'private'
}

interface Response {
  message_id: number
  forward_id: string
}

export class SendForwardMsg extends BaseAction<Payload, Response> {
  actionName = ActionName.SendForwardMsg
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]),
    group_id: Schema.union([Number, String]),
    messages: Schema.array(Schema.any()),
    message: Schema.array(Schema.any()),
    message_type: Schema.union(['group', 'private'])
  })

  protected async _handle(payload: Payload) {
    const messages = payload.messages ?? payload.message
    if (!messages) {
      throw new Error('未指定消息内容')
    }
    let contextMode = CreatePeerMode.Normal
    if (payload.message_type === 'group') {
      contextMode = CreatePeerMode.Group
    } else if (payload.message_type === 'private') {
      contextMode = CreatePeerMode.Private
    }
    const peer = await createPeer(this.ctx, payload, contextMode)

    const nodes = this.parseNodeContent(messages)
    let fake = true
    for (const node of nodes) {
      if (node.data.id) {
        fake = false
        break
      }
      if (node.data.content?.some(e => {
        return !MessageEncoder.support.includes(e.type)
      })) {
        fake = false
        break
      }
    }
    return await this.handleForwardNode(peer, nodes)
  }

  private parseNodeContent(nodes: OB11MessageNode[]) {
    return nodes.map(e => {
      return {
        type: e.type,
        data: {
          ...e.data,
          content: e.data.content ? message2List(e.data.content) : undefined
        }
      }
    })
  }

  private async handleFakeForwardNode(peer: Peer, nodes: OB11MessageNode[]): Promise<Response> {
    const encoder = new MessageEncoder(this.ctx, peer)
    const raw = await encoder.generate(nodes)
    const transmit = Msg.PbMultiMsgTransmit.encode({ pbItemList: raw.multiMsgItems }).finish()
    const resid = await this.ctx.app.pmhq.uploadForward(peer, transmit.subarray(1))
    const uuid = crypto.randomUUID()
    try {
      const msg = await this.ctx.ntMsgApi.sendMsg(peer, [{
        elementType: 10,
        elementId: '',
        arkElement: {
          bytesData: JSON.stringify({
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
              filename: uuid,
              tsum: raw.tsum,
            }),
            meta: {
              detail: {
                news: raw.news,
                resid,
                source: raw.source,
                summary: raw.summary,
                uniseq: uuid,
              }
            },
            prompt: '[聊天记录]',
            ver: '0.0.0.5',
            view: 'contact'
          })
        }
      }], 1800)
      const msgShortId = this.ctx.store.createMsgShortId({
        chatType: msg!.chatType,
        peerUid: msg!.peerUid
      }, msg!.msgId)
      return { message_id: msgShortId, forward_id: resid }
    } catch (e) {
      this.ctx.logger.error('合并转发失败', e)
      throw new Error(`发送伪造合并转发消息失败 (res_id: ${resid} `)
    }
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
        chatType: ChatType.C2C,
        peerUid: selfInfo.uid
      }
      const nodeMsg = await this.ctx.ntMsgApi.sendMsg(peer, sendElements)
      await this.ctx.sleep(300)
      return nodeMsg
    } catch (e) {
      this.ctx.logger.warn(e, '克隆转发消息失败,将忽略本条消息', msg)
    }
  }

  // 返回一个合并转发的消息id
  private async handleForwardNode(destPeer: Peer, messageNodes: OB11MessageNode[]): Promise<Response> {
    const selfPeer = {
      chatType: ChatType.C2C,
      peerUid: selfInfo.uid,
    }
    const nodeMsgIds: { msgId: string, peer: Peer }[] = []
    // 先判断一遍是不是id和自定义混用
    for (const messageNode of messageNodes) {
      // 一个node表示一个人的消息
      const nodeId = messageNode.data.id
      // 有nodeId表示一个子转发消息卡片
      if (nodeId) {
        const nodeMsg = await this.ctx.store.getMsgInfoByShortId(+nodeId)
        if (!nodeMsg) {
          this.ctx.logger.warn('转发消息失败，未找到消息', nodeId)
          continue
        }
        nodeMsgIds.push(nodeMsg)
      }
      else {
        // 自定义的消息
        // 提取消息段，发给自己生成消息id
        try {
          const { sendElements, deleteAfterSentFiles } = await createSendElements(
            this.ctx,
            messageNode.data.content as OB11MessageData[],
            destPeer
          )
          this.ctx.logger.info('开始生成转发节点', sendElements)
          const sendElementsSplit: SendMessageElement[][] = []
          let splitIndex = 0
          for (const ele of sendElements) {
            if (!sendElementsSplit[splitIndex]) {
              sendElementsSplit[splitIndex] = []
            }

            if (ele.elementType === ElementType.File || ele.elementType === ElementType.Video) {
              if (sendElementsSplit[splitIndex].length > 0) {
                splitIndex++
              }
              sendElementsSplit[splitIndex] = [ele]
              splitIndex++
            }
            else {
              sendElementsSplit[splitIndex].push(ele)
            }
          }
          this.ctx.logger.info('分割后的转发节点', sendElementsSplit)
          for (const eles of sendElementsSplit) {
            const nodeMsg = await this.ctx.app.sendMessage(this.ctx, selfPeer, eles, [])
            if (!nodeMsg) {
              this.ctx.logger.warn('转发节点生成失败', eles)
              continue
            }
            nodeMsgIds.push({ msgId: nodeMsg.msgId, peer: selfPeer })
            await this.ctx.sleep(300)
          }
          deleteAfterSentFiles.map(path => unlink(path))
        } catch (e) {
          this.ctx.logger.error('生成转发消息节点失败', e)
        }
      }
    }

    // 检查srcPeer是否一致，不一致则需要克隆成自己的消息, 让所有srcPeer都变成自己的，使其保持一致才能够转发
    const nodeMsgArray: RawMessage[] = []
    let srcPeer: Peer
    let needSendSelf = false
    for (const { msgId, peer } of nodeMsgIds) {
      const nodeMsg = (await this.ctx.ntMsgApi.getMsgsByMsgId(peer, [msgId])).msgList[0]
      srcPeer ??= { chatType: nodeMsg.chatType, peerUid: nodeMsg.peerUid }
      if (srcPeer.peerUid !== nodeMsg.peerUid) {
        needSendSelf = true
      }
      nodeMsgArray.push(nodeMsg)
    }
    let retMsgIds: string[] = []
    if (needSendSelf) {
      for (const msg of nodeMsgArray) {
        if (msg.peerUid === selfPeer.peerUid) {
          retMsgIds.push(msg.msgId)
          continue
        }
        const clonedMsg = await this.cloneMsg(msg)
        if (clonedMsg) retMsgIds.push(clonedMsg.msgId)
      }
    } else {
      retMsgIds = nodeMsgArray.map(msg => msg.msgId)
    }
    if (retMsgIds.length === 0) {
      throw Error('转发消息失败，节点为空')
    }
    const msg = await this.ctx.ntMsgApi.multiForwardMsg(srcPeer!, destPeer, retMsgIds)
    const resid = JSON.parse(msg.elements[0].arkElement!.bytesData).meta.detail.resid
    const msgShortId = this.ctx.store.createMsgShortId({
      chatType: msg.chatType,
      peerUid: msg.peerUid
    }, msg.msgId)
    return { message_id: msgShortId, forward_id: resid }
  }
}

export class SendPrivateForwardMsg extends SendForwardMsg {
  actionName = ActionName.GoCQHTTP_SendPrivateForwardMsg

  protected _handle(payload: Payload) {
    payload.message_type = 'private'
    return super._handle(payload)
  }
}

export class SendGroupForwardMsg extends SendForwardMsg {
  actionName = ActionName.GoCQHTTP_SendGroupForwardMsg

  protected _handle(payload: Payload) {
    payload.message_type = 'group'
    return super._handle(payload)
  }
}
