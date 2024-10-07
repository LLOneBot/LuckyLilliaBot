import h from '@satorijs/element'
import pathLib from 'node:path'
import * as NT from '@/ntqqapi/types'
import { Context } from 'cordis'
import { Message } from '@satorijs/protocol'
import { SendElement } from '@/ntqqapi/entities'
import { decodeMessage, getPeer } from './utils'
import { ObjectToSnake } from 'ts-case-convert'
import { uri2local } from '@/common/utils'
import { unlink } from 'node:fs/promises'
import { selfInfo } from '@/common/globalVars'

class State {
  children: (NT.SendMessageElement | string)[] = []

  constructor(public type: 'message' | 'multiForward') { }
}

export class MessageEncoder {
  public errors: Error[] = []
  public results: ObjectToSnake<Message>[] = []
  private elements: NT.SendMessageElement[] = []
  private deleteAfterSentFiles: string[] = []
  private stack: State[] = [new State('message')]
  private peer?: NT.Peer

  constructor(private ctx: Context, private channelId: string) { }

  async flush() {
    if (this.elements.length === 0) return

    if (this.stack[0].type === 'multiForward') {
      this.stack[0].children.push(...this.elements)
      this.elements = []
      return
    }

    this.peer ??= await getPeer(this.ctx, this.channelId)
    const sent = await this.ctx.ntMsgApi.sendMsg(this.peer, this.elements)
    if (sent) {
      this.ctx.logger.info('消息发送', this.peer)
      const result = await decodeMessage(this.ctx, sent)
      result && this.results.push(result)
    }
    this.deleteAfterSentFiles.forEach(path => unlink(path))
    this.deleteAfterSentFiles = []
    this.elements = []
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

  private async getPeerFromMsgId(msgId: string): Promise<NT.Peer | undefined> {
    this.peer ??= await getPeer(this.ctx, this.channelId)
    const msg = (await this.ctx.ntMsgApi.getMsgsByMsgId(this.peer, [msgId])).msgList
    if (msg.length > 0) {
      return this.peer
    } else {
      const cacheMsg = this.ctx.store.getMsgCache(msgId)
      if (cacheMsg) {
        return {
          peerUid: cacheMsg.peerUid,
          chatType: cacheMsg.chatType
        }
      }
      const c2cMsg = await this.ctx.ntMsgApi.queryMsgsById(NT.ChatType.C2C, msgId)
      if (c2cMsg.msgList.length) {
        return {
          peerUid: c2cMsg.msgList[0].peerUid,
          chatType: c2cMsg.msgList[0].chatType
        }
      }
      const groupMsg = await this.ctx.ntMsgApi.queryMsgsById(NT.ChatType.Group, msgId)
      if (groupMsg.msgList.length) {
        return {
          peerUid: groupMsg.msgList[0].peerUid,
          chatType: groupMsg.msgList[0].chatType
        }
      }
    }
  }

  private async forward(msgId: string, srcPeer: NT.Peer, destPeer: NT.Peer) {
    const list = await this.ctx.ntMsgApi.forwardMsg(srcPeer, destPeer, [msgId])
    return list[0]
  }

  private async multiForward() {
    if (!this.stack[0].children.length) return

    const selfPeer = {
      chatType: NT.ChatType.C2C,
      peerUid: selfInfo.uid,
    }
    const nodeMsgIds: { msgId: string, peer: NT.Peer }[] = []
    for (const node of this.stack[0].children) {
      if (typeof node === 'string') {
        if (node.length !== 19) {
          this.ctx.logger.warn('转发消息失败，消息 ID 不合法', node)
          continue
        }
        const peer = await this.getPeerFromMsgId(node)
        if (!peer) {
          this.ctx.logger.warn('转发消息失败，未找到消息', node)
          continue
        }
        nodeMsgIds.push({ msgId: node, peer })
      } else {
        try {
          const sent = await this.ctx.ntMsgApi.sendMsg(selfPeer, [node])
          if (!sent) {
            this.ctx.logger.warn('转发节点生成失败', node)
            continue
          }
          nodeMsgIds.push({ msgId: sent.msgId, peer: selfPeer })
          await this.ctx.sleep(100)
        } catch (e) {
          this.ctx.logger.error('生成转发消息节点失败', e)
        }
      }
    }

    let srcPeer: NT.Peer
    let needSendSelf = false
    for (const { peer } of nodeMsgIds) {
      srcPeer ??= { chatType: peer.chatType, peerUid: peer.peerUid }
      if (srcPeer.peerUid !== peer.peerUid) {
        needSendSelf = true
        break
      }
    }
    let retMsgIds: string[] = []
    if (needSendSelf) {
      for (const { msgId, peer } of nodeMsgIds) {
        const srcPeer = {
          peerUid: peer.peerUid,
          chatType: peer.chatType
        }
        const clonedMsg = await this.forward(msgId, srcPeer, selfPeer)
        if (clonedMsg) {
          retMsgIds.push(clonedMsg.msgId)
        }
        await this.ctx.sleep(100)
      }
      srcPeer = selfPeer
    } else {
      retMsgIds = nodeMsgIds.map(e => e.msgId)
    }
    if (retMsgIds.length === 0) {
      throw Error('转发消息失败，节点为空')
    }

    if (this.stack[1].type === 'multiForward') {
      this.peer ??= await getPeer(this.ctx, this.channelId)
      const msg = await this.ctx.ntMsgApi.multiForwardMsg(srcPeer!, selfPeer, retMsgIds)
      this.stack[1].children.push(...msg.elements as NT.SendMessageElement[])
    } else {
      this.peer ??= await getPeer(this.ctx, this.channelId)
      await this.ctx.ntMsgApi.multiForwardMsg(srcPeer!, this.peer, retMsgIds)
      this.ctx.logger.info('消息发送', this.peer)
    }
  }

  async visit(element: h) {
    const { type, attrs, children } = element
    if (type === 'text') {
      this.elements.push(SendElement.text(attrs.content))
    } else if (type === 'at') {
      if (attrs.type === 'all') {
        this.elements.push(SendElement.at('', '', NT.AtType.All, '@全体成员'))
      } else {
        const uid = await this.ctx.ntUserApi.getUidByUin(attrs.id) ?? ''
        const display = attrs.name ? '@' + attrs.name : ''
        this.elements.push(SendElement.at(attrs.id, uid, NT.AtType.One, display))
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
      this.deleteAfterSentFiles.push(element.picElement.sourcePath!)
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
      const element = await SendElement.video(this.ctx, path, undefined, thumb)
      this.deleteAfterSentFiles.push(element.videoElement.filePath)
      this.elements.push(element)
      await this.flush()
    } else if (type === 'file') {
      await this.flush()
      const url = attrs.src ?? attrs.url
      const path = await this.fetchFile(url)
      const fileName = attrs.title ?? pathLib.basename(path)
      this.elements.push(await SendElement.file(this.ctx, path, fileName))
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
      const last = this.elements.at(-1)
      if (last?.elementType === 1 && last.textElement.atType === 0) {
        if (!last.textElement.content.endsWith('\n')) {
          last.textElement.content += '\n'
        }
      } else {
        this.elements.push(SendElement.text('\n'))
      }
    } else if (type === 'message') {
      if (attrs.id && attrs.forward) {
        await this.flush()
        const srcPeer = await this.getPeerFromMsgId(attrs.id)
        if (srcPeer) {
          this.peer ??= await getPeer(this.ctx, this.channelId)
          const sent = await this.forward(attrs.id, srcPeer, this.peer)
          if (sent) {
            this.ctx.logger.info('消息发送', this.peer)
            const result = await decodeMessage(this.ctx, sent)
            result && this.results.push(result)
          }
        }
      } else if (attrs.forward) {
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
      const source = (await this.ctx.ntMsgApi.getMsgsByMsgId(this.peer, [attrs.id])).msgList[0]
      if (source) {
        this.elements.push(SendElement.reply(source.msgSeq, source.msgId, source.senderUin))
      }
    } else if (type === 'face') {
      this.elements.push(SendElement.face(+attrs.id, +attrs.type))
    } else if (type === 'mface') {
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
