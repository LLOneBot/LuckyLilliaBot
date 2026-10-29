import { OB11MessageData, OB11MessageDataType, OB11MessageNode } from '../../types'
import { ActionName } from '../types'
import { BaseAction, Schema } from '../BaseAction'
import { transformOutgoingSegments } from '../../transform/message/outgoing'
import { message2List, createPeer, CreatePeerMode } from '../../utils'
import { MsgInfo } from '../../../../protocol/nt-protocol/store'
import { OB11Entities } from '@/plugin/internal/adapter/onebot11/entities'
import { ChatType } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'

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
    source: Schema.string(),
    news: Schema.array(Schema.object({ text: Schema.string() })),
    summary: Schema.string(),
    prompt: Schema.string(),
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

    if (nodes.some(e => e.data.id)) {
      const processedIds = new Set<string>()
      const convertedNodes = []
      for (const item of nodes) {
        if (item.data.id) {
          const idStr = item.data.id.toString()
          if (processedIds.has(idStr)) {
            continue
          }
          processedIds.add(idStr)
          const msgInfo = await this.ctx.store.getMsgInfoByShortId(+item.data.id)
          if (!msgInfo) {
            this.ctx.logger.warn(`消息 ${item.data.id} 未找到`)
            continue
          }
          const node = await this.getMessageNode(msgInfo, +item.data.id)
          convertedNodes.push(node)
        } else {
          convertedNodes.push(item)
        }
      }
      nodes = convertedNodes
    }

    if (nodes.some(e => e.data.seq)) {
      this.sortNodesWithSeq(nodes)
    }

    this.assignSequentialSeqs(nodes)
    this.assignMissingTimes(nodes)

    const { sendElements, deleteAfterSentFiles } = await transformOutgoingSegments(this.ctx, nodes, peer, true)
    const returnMsg = await this.ctx.app.sendMessage(this.ctx, peer, sendElements, deleteAfterSentFiles)
    const msgShortId = this.ctx.store.createMsgShortId(returnMsg)
    // 自己发的群合并转发, OlPush 回声里是 multiForwardMsgElement; 私聊没有回声, 用的是输入的 arkElement
    let forwardId
    if (returnMsg.elements[0].multiForwardMsgElement) {
      forwardId = returnMsg.elements[0].multiForwardMsgElement.resId
    } else {
      forwardId = JSON.parse(returnMsg.elements[0].arkElement!.bytesData).meta.detail.resid
    }
    return {
      message_id: msgShortId,
      forward_id: forwardId,
    }
  }

  private async getMessageNode(msgInfo: MsgInfo, shortId: number) {
    let msg = this.ctx.store.getMsgByMsgId(msgInfo.msgId)
    if (!msg) {
      const res = await this.ctx.ntMsgApi.getSingleMsg(msgInfo.peer, msgInfo.msgSeq)
      if (res.msgList.length === 0) {
        throw new Error(`无法获取消息 ${shortId}`)
      }
      msg = res.msgList[0]
    }
    const obMsg = await OB11Entities.message(this.ctx, msg)
    if (!obMsg) {
      const shortId = this.ctx.store.createMsgShortId(msg)
      throw new Error(`消息 ${shortId} 解析失败`)
    }
    return {
      type: OB11MessageDataType.Node as const,
      data: {
        name: obMsg.sender.nickname,
        uin: obMsg.sender.user_id,
        content: obMsg.message as OB11MessageData[],
        seq: obMsg.message_seq,
        time: obMsg.time,
        message_style: msg.msgStyle ? {
          bubble_id: msg.msgStyle.bubbleId,
          pendant_id: msg.msgStyle.pendantId,
          font_id: msg.msgStyle.fontId,
          font_effect_id: msg.msgStyle.fontEffectId,
          is_cs_font_effect_enabled: msg.msgStyle.isCsFontEffectEnabled,
          bubble_diy_text_id: msg.msgStyle.bubbleDiyTextId
        } : undefined
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

  private sortNodesWithSeq<T extends OB11MessageNode>(nodes: T[]) {
    const sortedNodes = nodes
      .filter((node): node is T & {
        data: { seq: number | string }
      } => !!node.data.seq)
      .sort((a, b) => +a.data.seq - +b.data.seq)

    let sortedIndex = 0
    for (let index = 0; index < nodes.length; index++) {
      if (nodes[index].data.seq) {
        nodes[index] = sortedNodes[sortedIndex++]
      }
    }
  }

  private assignSequentialSeqs(nodes: OB11MessageNode[]) {
    const firstDefinedIndex = nodes.findIndex(node =>
      node.data.seq
      && Number.isFinite(+node.data.seq)
    )
    if (firstDefinedIndex === -1) {
      const initSeq = Math.trunc(Math.random() * 65430)
      nodes.forEach((node, index) => node.data.seq = initSeq + index)
      return
    }

    const firstDefinedSeq = Math.trunc(+nodes[firstDefinedIndex].data.seq!)
    let nextSeq = Math.max(0, firstDefinedSeq - firstDefinedIndex)

    for (const node of nodes) {
      const currentSeq = Number(node.data.seq)
      if (node.data.seq && Number.isFinite(currentSeq)) {
        node.data.seq = Math.max(Math.trunc(currentSeq), nextSeq)
      } else {
        node.data.seq = nextSeq
      }
      nextSeq = Number(node.data.seq) + 1
    }
  }

  private assignMissingTimes(nodes: OB11MessageNode[]) {
    const isValidTime = (time: number | string | undefined) => {
      const numericTime = Number(time)
      return time !== undefined && time !== '' && Number.isFinite(numericTime) && numericTime > 0
    }
    const firstDefinedIndex = nodes.findIndex(node => isValidTime(node.data.time))

    if (firstDefinedIndex === -1) {
      const lastTime = Math.floor(Date.now() / 1000)
      const firstTime = lastTime - nodes.length + 1
      nodes.forEach((node, index) => node.data.time = firstTime + index)
      return
    }

    const firstDefinedTime = Math.trunc(Number(nodes[firstDefinedIndex].data.time))
    let nextTime = firstDefinedTime - firstDefinedIndex

    for (const node of nodes) {
      if (isValidTime(node.data.time)) {
        nextTime = Math.trunc(Number(node.data.time)) + 1
      } else {
        node.data.time = nextTime
        nextTime++
      }
    }
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
