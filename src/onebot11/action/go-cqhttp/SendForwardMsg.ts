import { unlink } from 'node:fs/promises'
import { OB11MessageData, OB11MessageDataType, OB11MessageNode } from '../../types'
import { ActionName } from '../types'
import { BaseAction, Schema } from '../BaseAction'
import { Peer } from '@/ntqqapi/types/msg'
import { ChatType, ElementType, SendMessageElement } from '@/ntqqapi/types'
import { selfInfo } from '@/common/globalVars'
import { message2List, createSendElements, createPeer, CreatePeerMode } from '../../helper/createMessage'
import { MessageEncoder } from '@/onebot11/helper/createMultiMessage'
import { randomUUID } from 'node:crypto'
import { MsgInfo } from '../../../main/store'
import { OB11Entities } from '@/onebot11/entities'

interface Payload {
  user_id?: string | number
  group_id?: string | number
  messages?: OB11MessageNode[]
  message?: OB11MessageNode[]
  message_type?: 'group' | 'private'
  // 合并转发自定义外显
  source?: string
  news?: { text: string }[]
  summary?: string
  prompt?: string
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
    message_type: Schema.union(['group', 'private']),
  })

  protected async _handle(payload: Payload) {
    const messages = (payload.messages?.length ? payload.messages : null) ?? payload.message
    if (!messages || messages.length === 0) {
      throw new Error('未指定消息内容')
    }
    let contextMode = CreatePeerMode.Normal
    if (payload.message_type === 'group') {
      contextMode = CreatePeerMode.Group
    }
    else if (payload.message_type === 'private') {
      contextMode = CreatePeerMode.Private
    }
    const peer = await createPeer(this.ctx, payload, contextMode)

    let nodes = this.parseNodeContent(messages)
    let fake = true
    let msgInfos: MsgInfo[] | undefined

    if (nodes.every(e => e.data.id)) {
      msgInfos = []
      for (const node of nodes) {
        const msgInfo = await this.ctx.store.getMsgInfoByShortId(+node.data.id!)
        if (!msgInfo) {
          this.ctx.logger.warn(`消息 ${node.data.id} 未找到`)
          continue
        }
        msgInfos.push(msgInfo)
      }
      let srcPeer: Peer
      let needSendSelf = false
      for (const { peer } of msgInfos) {
        srcPeer ??= peer
        if (srcPeer.peerUid !== peer.peerUid) {
          needSendSelf = true
        }
      }
      if (needSendSelf) {
        const convertedNodes: {
          type: OB11MessageDataType.Node
          data: {
            name: string
            uin: number
            content: OB11MessageData[]
          }
        }[] = []
        for (const msgInfo of msgInfos) {
          const node = await this.getMessageNode(msgInfo)
          convertedNodes.push(node)
        }
        nodes = convertedNodes
        msgInfos = undefined
      } else {
        fake = false
      }
    } else if (nodes.some(e => e.data.id)) {
      const convertedNodes: {
        type: OB11MessageDataType.Node
        data: {
          name?: string
          uin?: number | string
          content: OB11MessageData[] | undefined
        }
      }[] = []
      for (const item of nodes) {
        if (item.data.id) {
          const msgInfo = await this.ctx.store.getMsgInfoByShortId(+item.data.id!)
          if (!msgInfo) {
            this.ctx.logger.warn(`消息 ${item.data.id} 未找到`)
            continue
          }
          const node = await this.getMessageNode(msgInfo)
          convertedNodes.push(node)
        } else {
          convertedNodes.push(item)
        }
      }
      nodes = convertedNodes
    }

    for (const node of nodes) {
      if (node.data.content?.some(e => {
        return !MessageEncoder.support.includes(e.type)
      })) {
        fake = false
        break
      }
    }

    return fake ? await this.handleFakeForwardNode(peer, nodes, {
      source: payload.source,
      news: payload.news,
      summary: payload.summary,
      prompt: payload.prompt
    }) : await this.handleForwardNode(peer, nodes, msgInfos)
  }

  private async getMessageNode(msgInfo: MsgInfo) {
    let msg = this.ctx.store.getMsgCache(msgInfo.msgId)
    if (!msg) {
      const res = await this.ctx.ntMsgApi.getMsgsByMsgId(msgInfo.peer, [msgInfo.msgId])
      if (res.msgList.length === 0) {
        const shortId = await this.ctx.store.getShortIdByMsgId(msgInfo.msgId)
        throw new Error(`无法获取消息 ${shortId ?? ''}`)
      }
      msg = res.msgList[0]
    }
    const obMsg = await OB11Entities.message(this.ctx, msg)
    if (!obMsg) {
      const shortId = this.ctx.store.createMsgShortId(msg)
      throw new Error(`消息 ${shortId} 解析失败`)
    }
    return {
      type: OB11MessageDataType.Node as OB11MessageDataType.Node,
      data: {
        name: obMsg.sender.nickname,
        uin: obMsg.sender.user_id,
        content: obMsg.message as OB11MessageData[]
      }
    }
  }

  private parseNodeContent(nodes: OB11MessageNode[]) {
    return nodes.map(e => {
      return {
        type: e.type,
        data: {
          ...e.data,
          content: e.data.content ? message2List(e.data.content) : undefined,
        },
      }
    })
  }

  private async handleFakeForwardNode(peer: Peer, nodes: OB11MessageNode[], options?: {
    source?: string
    news?: { text: string }[]
    summary?: string
    prompt?: string
  }): Promise<Response> {
    const encoder = new MessageEncoder(this.ctx, peer)
    const raw = await encoder.generate(nodes, options)
    const resid = await this.ctx.app.pmhq.uploadForward(peer, raw.multiMsgItems)
    const uuid = randomUUID()
    const prompt = options?.prompt ?? '[聊天记录]'
    try {
      const msg = await this.ctx.app.sendMessage(this.ctx, peer, [{
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
              width: 300,
            },
            desc: prompt,
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
              },
            },
            prompt,
            ver: '0.0.0.5',
            view: 'contact',
          }),
        },
      }], encoder.deleteAfterSentFiles)
      const msgShortId = this.ctx.store.createMsgShortId(msg)
      return { message_id: msgShortId, forward_id: resid }
    } catch (e) {
      this.ctx.logger.error('合并转发失败', e)
      throw new Error(`发送伪造合并转发消息失败 (res_id: ${resid})`)
    }
  }

  // 返回一个合并转发的消息id
  private async handleForwardNode(destPeer: Peer, messageNodes: OB11MessageNode[], msgInfos?: MsgInfo[]): Promise<Response> {
    let srcPeer: Peer
    let msgIds: string[] = []
    if (msgInfos) {
      srcPeer = msgInfos[0]?.peer
      msgIds = msgInfos.map(e => e.msgId)
    } else {
      srcPeer = {
        chatType: ChatType.C2C,
        peerUid: selfInfo.uid,
        guildId: ''
      }
      for (const messageNode of messageNodes) {
        if (messageNode.data.content) {
          // 自定义的消息
          // 提取消息段，发给自己生成消息id
          try {
            const { sendElements, deleteAfterSentFiles } = await createSendElements(
              this.ctx,
              messageNode.data.content as OB11MessageData[],
              destPeer,
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
              const nodeMsg = await this.ctx.app.sendMessage(this.ctx, srcPeer, eles, [])
              if (!nodeMsg) {
                this.ctx.logger.warn('转发节点生成失败', eles)
                continue
              }
              msgIds.push(nodeMsg.msgId)
            }
            deleteAfterSentFiles.map(path => unlink(path).then().catch(e => {
            }))
          } catch (e) {
            this.ctx.logger.error('生成转发消息节点失败', e)
          }
        }
      }
    }
    if (msgIds.length === 0) {
      throw new Error('转发消息失败，节点为空')
    }
    const msg = await this.ctx.ntMsgApi.multiForwardMsg(srcPeer, destPeer, msgIds)
    const resid = JSON.parse(msg.elements[0].arkElement!.bytesData).meta.detail.resid
    const msgShortId = this.ctx.store.createMsgShortId(msg)
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
