import { OB11MessageData, OB11MessageDataType, OB11MessageNode } from '../../types'
import { ActionName } from '../types'
import { BaseAction, Schema } from '../BaseAction'
import { transformOutgoingSegments } from '../../transform/message/outgoing'
import { message2List, createPeer, CreatePeerMode } from '../../utils'
import { MsgInfo } from '../../../main/store'
import { OB11Entities } from '@/onebot11/entities'
import { ChatType } from '@/ntqqapi/types'

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

    const { sendElements, deleteAfterSentFiles } = await transformOutgoingSegments(this.ctx, nodes, peer)
    const returnMsg = await this.ctx.app.sendMessage(this.ctx, peer, sendElements, deleteAfterSentFiles)
    const msgShortId = this.ctx.store.createMsgShortId(returnMsg)
    // 自己发出去的群聊合并转发，OlPush 推回来的 elements 是 multiForwardMsgElement 不是 arkElement（这是 QQ NT
    // 的正常行为），而发出去的私聊合并转发没有 OlPush 推回来，故其 elements 采用输入的 elements，为 arkElement
    let forwardId
    if (peer.chatType === ChatType.Group) {
      forwardId = returnMsg.elements[0].multiForwardMsgElement!.resId
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
