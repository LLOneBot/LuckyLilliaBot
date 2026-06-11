import h from '@satorijs/element'
import pathLib from 'node:path'
import * as NT from '@/ntqqapi/types'
import { Context } from 'cordis'
import { Message } from '@satorijs/protocol'
import { SendElement } from '@/ntqqapi/entities'
import { decodeMessage, decodeMessageId, getPeer } from './utils'
import { ObjectToSnake } from 'ts-case-convert'
import { uri2local } from '@/common/utils'
import { selfInfo } from '@/common/globalVars'

interface Author {
  id?: string
  name?: string
  avatar?: string
}

class State {
  author: Author = {}
  children: (NT.SendMessageElement[] | string)[] = []

  constructor(public type: 'message' | 'multiForward') { }
}

export class MessageEncoder {
  public errors: Error[] = []
  public results: ObjectToSnake<Message>[] = []
  private elements: NT.SendMessageElement[] = []
  private deleteAfterSentFiles: string[] = []
  private stack: State[] = [new State('message')]
  private peer?: NT.Peer
  private pLength?: number

  constructor(private ctx: Context, private channelId: string) { }

  async flush() {
    if (this.elements.length === 0) return
    if (this.pLength === this.elements.length) {
      this.elements.pop()
    }

    if (this.stack[0].type === 'multiForward') {
      this.stack[0].children.push([...this.elements])
      this.elements = []
      this.pLength = undefined
      return
    }

    this.peer ??= await getPeer(this.ctx, this.channelId)
    const sent = await this.ctx.app.sendMessage(
      this.ctx,
      this.peer,
      this.elements,
      this.deleteAfterSentFiles
    )
    this.ctx.logger.info('消息发送', this.peer)
    const result = await decodeMessage(this.ctx, sent)
    if (result) {
      this.results.push(result)
    }
    this.deleteAfterSentFiles = []
    this.elements = []
    this.pLength = undefined
  }

  private async fetchFile(url: string) {
    const res = await uri2local(this.ctx, url)
    if (!res.success) {
      this.ctx.logger.error(res.errMsg)
      throw Error(res.errMsg)
    }
    if (!res.isLocal) {
      this.deleteAfterSentFiles.push(res.path)
    }
    return res.path
  }

  private async getPeerAndElementsFromMsgSeq(
    peerUid: string,
    msgSeq: number
  ): Promise<{ peer: NT.Peer, elements: NT.MessageElement[] } | undefined> {
    this.peer ??= await getPeer(this.ctx, this.channelId)
    const cacheMsg = this.ctx.store.getMsgBySeq(peerUid, msgSeq)
    if (cacheMsg) {
      return {
        peer: {
          peerUid: cacheMsg.peerUid,
          chatType: cacheMsg.chatType,
        },
        elements: cacheMsg.elements
      }
    }
    const { msgList } = await this.ctx.ntMsgApi.getSingleMsg(this.peer, msgSeq)
    if (msgList[0]) {
      return {
        peer: {
          peerUid: msgList[0].peerUid,
          chatType: msgList[0].chatType,
        },
        elements: msgList[0].elements
      }
    }
  }

  private async multiForward() {
    if (!this.stack[0].children.length) return

    this.peer ??= await getPeer(this.ctx, this.channelId)
    const nodes: {
      senderUin: number
      senderName: string
      elements: NT.SendMessageElement[]
    }[] = []

    for (const item of this.stack[0].children) {
      let ntElems = []
      if (typeof item === 'string') {
        const { peerUid, msgSeq } = decodeMessageId(item)
        const info = await this.getPeerAndElementsFromMsgSeq(peerUid, msgSeq)
        if (!info) {
          this.ctx.logger.warn('转发消息失败，未找到消息', item)
          continue
        }
        const isGroup = this.peer.chatType === NT.ChatType.Group
        for (const element of info.elements) {
          if (element.elementType === NT.ElementType.Text) {
            ntElems.push(element as NT.SendTextElement)
          } else if (element.elementType === NT.ElementType.Pic) {
            const { originImageUrl, md5HexStr } = element.picElement!
            const url = await this.ctx.ntFileApi.getImageUrl(originImageUrl, md5HexStr)
            const path = await this.fetchFile(url)
            ntElems.push(await SendElement.pic(this.ctx, path))
          } else if (element.elementType === NT.ElementType.Ptt) {
            const { fileUuid } = element.pttElement!
            const url = await this.ctx.ntFileApi.getPttUrl(fileUuid, isGroup)
            const path = await this.fetchFile(url)
            ntElems.push(await SendElement.ptt(this.ctx, path))
          } else if (element.elementType === NT.ElementType.Video) {
            const { fileUuid } = element.videoElement!
            const url = await this.ctx.ntFileApi.getVideoUrl(fileUuid, isGroup)
            const path = await this.fetchFile(url)
            ntElems.push(await SendElement.video(this.ctx, path))
          } else if (element.elementType === NT.ElementType.Reply) {
            ntElems.push(element as NT.SendReplyElement)
          } else if (element.elementType === NT.ElementType.Face) {
            ntElems.push(element as NT.SendFaceElement)
          } else if (element.elementType === NT.ElementType.MarketFace) {
            ntElems.push(element as NT.SendMarketFaceElement)
          }
        }
      } else {
        ntElems = item
      }
      const nick = this.stack[0].author.name ?? selfInfo.nick
      const uin = this.stack[0].author.id ?? selfInfo.uin
      nodes.push({
        senderUin: +uin,
        senderName: nick,
        elements: ntElems
      })
    }

    const forward = SendElement.forward(nodes)
    if (this.stack[1].type === 'multiForward') {
      this.stack[1].children.push([forward])
    } else {
      const sent = await this.ctx.app.sendMessage(this.ctx, this.peer, [forward], this.deleteAfterSentFiles)
      const result = await decodeMessage(this.ctx, sent)
      if (result) {
        this.results.push(result)
      }
      this.deleteAfterSentFiles = []
    }
  }

  async visit(element: h) {
    const { type, attrs, children } = element
    if (type === 'text') {
      this.elements.push(SendElement.text(attrs.content))
    } else if (type === 'at') {
      this.peer ??= await getPeer(this.ctx, this.channelId)
      if (this.peer.chatType !== NT.ChatType.Group) {
        return
      }
      if (attrs.type === 'all') {
        this.elements.push(SendElement.at(0, NT.AtType.All, '@全体成员'))
      } else {
        const uin = +attrs.id
        let display
        if (attrs.name) {
          display = `@${attrs.name}`
        } else {
          const info = await this.ctx.ntGroupApi.getGroupMemberByUin(+this.peer.peerUid, uin, false)
          display = `@${info?.cardName || info?.nick || ''}`
        }
        this.elements.push(SendElement.at(uin, NT.AtType.One, display))
      }
    } else if (type === 'a') {
      await this.render(children)
      const prev = this.elements.at(-1)
      if (prev?.elementType === 1 && prev.textElement.atType === 0) {
        prev.textElement.content += ` ( ${attrs.href} )`
      }
    } else if (type === 'img' || type === 'image') {
      const url = attrs.src ?? attrs.url
      const path = await this.fetchFile(url)
      const element = await SendElement.pic(this.ctx, path)
      this.elements.push(element)
    } else if (type === 'audio') {
      await this.flush()
      const url = attrs.src ?? attrs.url
      const path = await this.fetchFile(url)
      this.elements.push(await SendElement.ptt(this.ctx, path))
      await this.flush()
    } else if (type === 'video') {
      await this.flush()
      const url = attrs.src ?? attrs.url
      const path = await this.fetchFile(url)
      let thumb: string | undefined
      if (attrs.poster) {
        thumb = await this.fetchFile(attrs.poster)
      }
      const element = await SendElement.video(this.ctx, path, thumb)
      this.elements.push(element)
      await this.flush()
    } else if (type === 'file') {
      await this.flush()
      const url = attrs.src ?? attrs.url
      const path = await this.fetchFile(url)
      const fileName = attrs.title ?? pathLib.basename(path)
      // TODO: 走独立的文件上传接口，如 ntFileApi.uploadGroupFile + ntMsgApi.sendGroupFileMessage
      await this.flush()
    } else if (type === 'br') {
      this.elements.push(SendElement.text('\n'))
    } else if (type === 'p') {
      const prev = this.elements.at(-1)
      if (prev?.elementType === 1 && prev.textElement.atType === 0) {
        if (!prev.textElement.content.endsWith('\n')) {
          prev.textElement.content += '\n'
        }
      } else if (prev) {
        this.elements.push(SendElement.text('\n'))
      }
      await this.render(children)
      this.pLength = this.elements.push(SendElement.text('\n'))
    } else if (type === 'message') {
      /*if (attrs.id && attrs.forward) {
        await this.flush()
        const info = await this.getPeerAndElementsFromMsgId(attrs.id)
        if (info) {
          const srcPeer = info.peer
          this.peer ??= await getPeer(this.ctx, this.channelId)
          const sent = await this.forward(attrs.id, srcPeer, this.peer)
          if (sent) {
            this.ctx.logger.info('消息发送', this.peer)
            const result = await decodeMessage(this.ctx, sent)
            if (result) {
              this.results.push(result)
            }
          }
        }
      } else*/ if (attrs.forward) {
        await this.flush()
        this.stack.unshift(new State('multiForward'))
        await this.render(children)
        await this.flush()
        await this.multiForward()
        this.stack.shift()
      } else if (attrs.id && this.stack[0].type === 'multiForward') {
        this.stack[0].children.push(attrs.id)
      } else {
        await this.render(children)
        await this.flush()
      }
    } else if (type === 'quote') {
      this.peer ??= await getPeer(this.ctx, this.channelId)
      const { peerUid, msgSeq } = decodeMessageId(attrs.id)
      let source = this.ctx.store.getMsgBySeq(peerUid, msgSeq)
      if (!source) {
        const { msgList } = await this.ctx.ntMsgApi.getSingleMsg(this.peer, msgSeq)
        source = msgList[0]
      }
      if (source) {
        this.elements.push(SendElement.reply(
          source.msgSeq,
          source.senderUin,
          source.msgTime,
          source.clientSeq,
          []
        ))
      }
    } else if (type === 'face') {
      this.elements.push(SendElement.face(+attrs.id, +attrs.type))
    } else if (type === 'author') {
      Object.assign(this.stack[0].author, attrs)
    } else if (type === 'llonebot:market-face') {
      this.elements.push(SendElement.mface(
        +attrs.emojiPackageId,
        attrs.emojiId,
        attrs.key,
        attrs.summary
      ))
    } else {
      await this.render(children)
    }
  }

  async render(elements: h[], flush?: boolean) {
    for (const element of elements) {
      await this.visit(element)
    }
    if (flush) {
      await this.flush()
    }
  }

  async send(content: h.Fragment) {
    const elements = h.normalize(content)
    await this.render(elements)
    await this.flush()
    if (this.errors.length) {
      throw new AggregateError(this.errors)
    } else {
      return this.results
    }
  }
}
