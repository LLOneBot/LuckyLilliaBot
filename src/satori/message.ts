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
import { InferProtoModelInput } from '@saltify/typeproto'
import { Media, Msg } from '@/ntqqapi/proto'
import { deflateSync } from 'node:zlib'

interface Author {
  id?: string
  name?: string
  avatar?: string
}

class State {
  author: Author = {}
  children: (NT.SendMessageElement[] | string)[] = []
  subMultiMsgItems: InferProtoModelInput<typeof Msg.PbMultiMsgItem>[] = []

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
    const sent = await this.ctx.ntMsgApi.sendMsg(this.peer, this.elements)
    if (sent) {
      this.ctx.logger.info('消息发送', this.peer)
      const result = await decodeMessage(this.ctx, sent)
      if (result) {
        this.results.push(result)
      }
    }
    this.deleteAfterSentFiles.forEach(path => {
      unlink(path).catch((e) => { })
    })
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

  private async getPeerAndElementsFromMsgId(msgId: string): Promise<{ peer: NT.Peer, elements: NT.MessageElement[] } | undefined> {
    this.peer ??= await getPeer(this.ctx, this.channelId)
    const msg = (await this.ctx.ntMsgApi.getMsgsByMsgId(this.peer, [msgId])).msgList
    if (msg.length > 0) {
      return {
        peer: this.peer,
        elements: msg[0].elements
      }
    } else {
      const cacheMsg = this.ctx.store.getMsgCache(msgId)
      if (cacheMsg) {
        return {
          peer: {
            peerUid: cacheMsg.peerUid,
            chatType: cacheMsg.chatType,
            guildId: ''
          },
          elements: cacheMsg.elements
        }
      }
      const c2cMsg = await this.ctx.ntMsgApi.queryMsgsById(NT.ChatType.C2C, msgId)
      if (c2cMsg.msgList.length) {
        return {
          peer: {
            peerUid: c2cMsg.msgList[0].peerUid,
            chatType: c2cMsg.msgList[0].chatType,
            guildId: ''
          },
          elements: c2cMsg.msgList[0].elements
        }
      }
      const groupMsg = await this.ctx.ntMsgApi.queryMsgsById(NT.ChatType.Group, msgId)
      if (groupMsg.msgList.length) {
        return {
          peer: {
            peerUid: groupMsg.msgList[0].peerUid,
            chatType: groupMsg.msgList[0].chatType,
            guildId: ''
          },
          elements: groupMsg.msgList[0].elements
        }
      }
    }
  }

  private async forward(msgId: string, srcPeer: NT.Peer, destPeer: NT.Peer) {
    const msg = await this.ctx.ntMsgApi.forwardMsg(srcPeer, destPeer, [msgId])
    return msg
  }

  private async multiForward() {
    if (!this.stack[0].children.length) return

    let needFake = false
    const isMix = this.stack[0].children.some(v => typeof v !== typeof this.stack[0].children[0])
    if (isMix) {
      needFake = true
    } else if (typeof this.stack[0].children[0] === 'object') {
      needFake = true
    }
    if (Object.keys(this.stack[0].author).length > 0) {
      needFake = true
    }

    if (needFake) {
      this.peer ??= await getPeer(this.ctx, this.channelId)
      const messages = []
      const news = []
      let seq = Math.trunc(Math.random() * 65430)
      let tsum = 0
      for (const item of this.stack[0].children) {
        let msgContent
        let preview = ''
        const elems = []

        let ntElems
        if (typeof item === 'string') {
          const info = await this.getPeerAndElementsFromMsgId(item)
          if (!info) {
            this.ctx.logger.warn('转发消息失败，未找到消息', item)
            continue
          }
          ntElems = info.elements
        } else {
          ntElems = item
        }

        for (const item of ntElems) {
          const converted = await ntToProto(this.ctx, item as NT.SendMessageElement, this.peer)
          if (converted) {
            if (converted.content) {
              msgContent = converted.content
            } else {
              elems.push(converted.element!)
            }
            preview += converted.preview
          }
        }

        const isGroup = this.peer.chatType === NT.ChatType.Group
        const nick = this.stack[0].author.name ?? selfInfo.nick
        const uin = this.stack[0].author.id ?? selfInfo.uin
        messages.push({
          routingHead: {
            fromUin: +uin, // 或 1094950020
            c2c: isGroup ? undefined : {
              friendName: nick
            },
            group: isGroup ? {
              groupCode: 284840486,
              groupCard: nick
            } : undefined
          },
          contentHead: {
            msgType: isGroup ? 82 : 9,
            random: Math.floor(Math.random() * 4294967290),
            msgSeq: seq,
            msgTime: Math.trunc(Date.now() / 1000),
            pkgNum: 1,
            pkgIndex: 0,
            divSeq: 0,
            forward: {
              field1: 0,
              field2: 0,
              field3: 0,
              field4: '',
              avatar: ''
            }
          },
          body: {
            richText: {
              elems
            },
            msgContent
          }
        })
        if (news.length < 4) {
          news.push({
            text: `${nick}: ${preview}`
          })
        }
        seq++
        tsum++
      }

      const multiMsgItems = [{
        fileName: 'MultiMsg',
        buffer: {
          msg: messages
        }
      }, ...this.stack[0].subMultiMsgItems]
      const resid = await this.ctx.app.pmhq.uploadForward(this.peer, multiMsgItems)
      const id = crypto.randomUUID()
      const isGroup = this.peer.chatType === NT.ChatType.Group
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
          filename: id,
          tsum,
        }),
        meta: {
          detail: {
            news,
            resid,
            source: isGroup ? '群聊的聊天记录' : '聊天记录',
            summary: `查看${tsum}条转发消息`,
            uniseq: id,
          }
        },
        prompt: '[聊天记录]',
        ver: '0.0.0.5',
        view: 'contact'
      })
      if (this.stack[1].type === 'multiForward') {
        this.stack[1].children.push([{
          elementType: 10,
          elementId: '',
          arkElement: {
            bytesData: content
          }
        }])
        this.stack[1].subMultiMsgItems.push({
          fileName: id,
          buffer: {
            msg: messages
          }
        })
      } else {
        const sent = await this.ctx.app.sendMessage(this.ctx, this.peer, [{
          elementType: 10,
          elementId: '',
          arkElement: {
            bytesData: content
          }
        }], this.deleteAfterSentFiles)
        const result = await decodeMessage(this.ctx, sent)
        if (result) {
          this.results.push(result)
        }
        this.deleteAfterSentFiles = []
      }
      return
    }

    const selfPeer: NT.Peer = {
      chatType: NT.ChatType.C2C,
      peerUid: selfInfo.uid,
      guildId: ''
    }
    const nodeMsgIds: { msgId: string, peer: NT.Peer }[] = []
    for (const node of this.stack[0].children) {
      if (typeof node === 'string') {
        if (node.length !== 19) {
          this.ctx.logger.warn('转发消息失败，消息 ID 不合法', node)
          continue
        }
        const info = await this.getPeerAndElementsFromMsgId(node)
        if (!info) {
          this.ctx.logger.warn('转发消息失败，未找到消息', node)
          continue
        }
        nodeMsgIds.push({ msgId: node, peer: info.peer })
      }
    }

    let srcPeer: NT.Peer
    let needSendSelf = false
    for (const { peer } of nodeMsgIds) {
      srcPeer ??= {
        chatType: peer.chatType,
        peerUid: peer.peerUid,
        guildId: ''
      }
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
          chatType: peer.chatType,
          guildId: ''
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
      const { resid, uniseq } = JSON.parse(msg.elements[0].arkElement!.bytesData).meta.detail
      this.stack[1].children.push([...msg.elements as NT.SendMessageElement[]])
      this.stack[1].subMultiMsgItems.push(...(await this.ctx.app.pmhq.getMultiMsg(resid)).map(e => {
        if (e.fileName === 'MultiMsg') {
          return {
            fileName: uniseq,
            buffer: e.buffer
          }
        }
        return e
      }))
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
      this.peer ??= await getPeer(this.ctx, this.channelId)
      if (this.peer.chatType !== NT.ChatType.Group) {
        return
      }
      if (attrs.type === 'all') {
        this.elements.push(SendElement.at('', '', NT.AtType.All, '@全体成员'))
      } else {
        const uid = await this.ctx.ntUserApi.getUidByUin(attrs.id, this.peer.peerUid)
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
      const element = await SendElement.video(this.ctx, path, thumb)
      this.deleteAfterSentFiles.push(element.videoElement.filePath!)
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
      this.pLength = this.elements.push(SendElement.text('\n'))
    } else if (type === 'message') {
      if (attrs.id && attrs.forward) {
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
        this.elements.push(SendElement.reply(source.msgSeq, source.msgId, source.senderUid))
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

interface NTToProtoOutput {
  element?: InferProtoModelInput<typeof Msg.Elem>
  content?: Buffer
  preview: string
}

async function ntToProto(ctx: Context, input: NT.SendMessageElement, peer: NT.Peer): Promise<NTToProtoOutput | undefined> {
  if (input.elementType === NT.ElementType.Text) {
    return {
      element: {
        text: {
          str: input.textElement.content
        }
      },
      preview: input.textElement.content.slice(0, 70)
    }
  } else if (input.elementType === NT.ElementType.Pic) {
    const isGroup = peer.chatType === NT.ChatType.Group
    const path = input.picElement.sourcePath!
    const data = await ctx.ntFileApi.uploadRMFileWithoutMsg(path, isGroup ? 4 : 3, peer.peerUid)
    return {
      element: {
        commonElem: {
          serviceType: 48,
          pbElem: Media.MsgInfo.encode({
            msgInfoBody: [{
              index: {
                info: {
                  fileSize: +data.commonFileInfo.fileSize,
                  md5HexStr: data.commonFileInfo.md5,
                  sha1HexStr: data.commonFileInfo.sha,
                  fileName: data.commonFileInfo.fileName,
                  fileType: {
                    type: 1,
                    picFormat: input.picElement.picType
                  },
                  width: input.picElement.picWidth,
                  height: input.picElement.picHeight,
                  time: 0,
                  original: 1
                },
                fileUuid: data.fileId,
                storeID: 1,
                expire: isGroup ? 2678400 : 157680000
              },
              pic: {
                urlPath: `/download?appid=${isGroup ? 1407 : 1406}&fileid=${data.fileId}`,
                ext: {
                  originalParam: '&spec=0',
                  bigParam: '&spec=720',
                  thumbParam: '&spec=198'
                },
                domain: 'multimedia.nt.qq.com.cn'
              },
              fileExist: true
            }],
            extBizInfo: {
              pic: {
                bizType: 0,
                summary: '',
                fromScene: isGroup ? 2 : 1, // 怀旧版 PCQQ 私聊收图需要
                toScene: isGroup ? 2 : 1, // 怀旧版 PCQQ 私聊收图需要
                oldFileId: isGroup ? 574859779 : undefined // 怀旧版 PCQQ 群聊收图需要
              },
              busiType: input.picElement.picSubType
            }
          }),
          businessType: isGroup ? 20 : 10
        }
      },
      preview: input.picElement.picSubType === 1 ? '[动画表情]' : '[图片]'
    }
  } else if (input.elementType === NT.ElementType.Video) {
    const filePath = input.videoElement.filePath!
    const thumbPath = input.videoElement.thumbPath!.get(0)!
    let data
    if (peer.chatType === NT.ChatType.Group) {
      data = await ctx.ntFileApi.uploadGroupVideo(peer.peerUid, filePath, thumbPath)
    } else {
      data = await ctx.ntFileApi.uploadC2CVideo(peer.peerUid, filePath, thumbPath)
    }
    return {
      element: {
        commonElem: {
          serviceType: 48,
          pbElem: Media.MsgInfo.encode(data.msgInfo),
          businessType: peer.chatType === NT.ChatType.Group ? 21 : 11
        }
      },
      preview: '[视频]'
    }
  } else if (input.elementType === NT.ElementType.File) {
    const path = input.fileElement.filePath!
    const fileName = input.fileElement.fileName!
    if (peer.chatType === NT.ChatType.Group) {
      const data = await ctx.ntFileApi.uploadGroupFile(peer.peerUid, path, fileName)
      const extra = Msg.GroupFileExtra.encode({
        field1: 6,
        fileName,
        inner: {
          info: {
            busId: 102,
            fileId: data.fileId,
            fileSize: +input.fileElement.fileSize!,
            fileName,
            fileMd5: data.fileMd5,
          },
        },
      })
      const lenBuf = Buffer.alloc(2)
      lenBuf.writeUInt16BE(extra.length)
      return {
        element: {
          transElemInfo: {
            elemType: 24,
            elemValue: Buffer.concat([Buffer.from([0x01]), lenBuf, extra]),
          }
        },
        preview: `[文件] ${fileName}`
      }
    } else {
      const data = await ctx.ntFileApi.uploadC2CFile(peer.peerUid, path, fileName)
      const extra = Msg.FileExtra.encode({
        file: {
          fileType: 0,
          fileUuid: data.fileId,
          fileMd5: data.file10MMd5,
          fileName,
          fileSize: +input.fileElement.fileSize!,
          subCmd: 1,
          dangerLevel: 0,
          expireTime: Math.floor((Date.now() / 1000) + 7 * 24 * 60 * 60),
          fileIdCrcMedia: data.crcMedia
        }
      })
      return {
        content: extra,
        preview: `[文件] ${fileName}`
      }
    }
  } else if (input.elementType === NT.ElementType.Ark) {
    const content = input.arkElement.bytesData!
    return {
      element: {
        lightApp: {
          data: Buffer.concat([Buffer.from([1]), deflateSync(Buffer.from(content, 'utf-8'))])
        }
      },
      preview: JSON.parse(content).prompt
    }
  }
}
