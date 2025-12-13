import { resolveMilkyUri } from '@/milky/common/download'
import type { Context } from 'cordis'
import { OutgoingForwardedMessage, OutgoingSegment } from '@saltify/milky-types'
import { AtType, Peer, RichMediaUploadCompleteNotify, SendMessageElement } from '@/ntqqapi/types'
import { SendElement } from '@/ntqqapi/entities'
import { selfInfo, TEMP_DIR } from '@/common/globalVars'
import { unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Msg, Media } from '@/ntqqapi/proto'
import faceConfig from '@/ntqqapi/helper/face_config.json'
import { deflateSync } from 'node:zlib'
import { InferProtoModelInput } from '@saltify/typeproto'

export async function transformOutgoingMessage(
  ctx: Context,
  segments: OutgoingSegment[],
  peerUid: string,
  isGroup: boolean = false,
) {
  const elements: SendMessageElement[] = []
  const deleteAfterSentFiles: string[] = []

  for (const segment of segments) {
    try {
      if (segment.type === 'text') {
        elements.push(SendElement.text(segment.data.text))
      } else if (segment.type === 'mention' && isGroup) {
        const memberUin = segment.data.user_id.toString()
        const memberUid = await ctx.ntUserApi.getUidByUin(memberUin, peerUid)
        elements.push(SendElement.at(memberUin, memberUid, AtType.One, ''))
      } else if (segment.type === 'mention_all' && isGroup) {
        elements.push(SendElement.at('', '', AtType.All, '@全体成员'))
      } else if (segment.type === 'face') {
        elements.push(SendElement.face(+segment.data.face_id))
      } else if (segment.type === 'reply') {
        const replyMsgSeq = segment.data.message_seq.toString()
        const peer = {
          chatType: isGroup ? 2 : 1,
          peerUid,
          guildId: ''
        }
        const source = await ctx.ntMsgApi.getMsgsBySeqAndCount(peer, replyMsgSeq, 1, true, true)
        if (source.msgList.length === 0) {
          throw new Error('被回复的消息未找到')
        }
        elements.push(SendElement.reply(replyMsgSeq, source.msgList[0].msgId, source.msgList[0].senderUin))
      } else if (segment.type === 'image') {
        const imageBuffer = await resolveMilkyUri(segment.data.uri)
        // Save to temp file and upload
        const tempPath = path.join(TEMP_DIR, `image-${randomUUID()}`)
        await writeFile(tempPath, imageBuffer)
        const subType = segment.data.sub_type === 'sticker' ? 1 : 0
        const picElement = await SendElement.pic(ctx, tempPath, segment.data.summary ?? '', subType)
        elements.push(picElement)
        deleteAfterSentFiles.push(tempPath)
      } else if (segment.type === 'record') {
        const recordBuffer = await resolveMilkyUri(segment.data.uri)
        const tempPath = path.join(TEMP_DIR, `audio-${randomUUID()}`)
        await writeFile(tempPath, recordBuffer)
        const pttElement = await SendElement.ptt(ctx, tempPath)
        elements.push(pttElement)
        deleteAfterSentFiles.push(tempPath)
      } else if (segment.type === 'video') {
        const videoBuffer = await resolveMilkyUri(segment.data.uri)
        const tempPath = path.join(TEMP_DIR, `video-${randomUUID()}`)
        await writeFile(tempPath, videoBuffer)
        let thumbTempPath: string | undefined = undefined
        if (segment.data.thumb_uri) {
          const thumbBuffer = await resolveMilkyUri(segment.data.thumb_uri)
          const thumbTempPath = path.join(TEMP_DIR, `thumb-${randomUUID()}`)
          await writeFile(thumbTempPath, thumbBuffer)
          deleteAfterSentFiles.push(thumbTempPath)
        }
        const videoElement = await SendElement.video(ctx, tempPath, thumbTempPath)
        elements.push(videoElement)
        deleteAfterSentFiles.push(tempPath)
      }
    } catch (error) {
      ctx.logger.error('MilkyTransform', `Failed to transform segment ${segment.type}: ${error}`)
    }
  }

  return {
    elements,
    deleteAfterSentFiles
  }
}

export async function transformOutgoingForwardMessages(
  ctx: Context,
  messages: OutgoingForwardedMessage[],
  peer: Peer
) {
  const encoder = new ForwardMessageEncoder(ctx, peer)
  return await encoder.generate(messages)
}

class ForwardMessageEncoder {
  static support = ['text', 'face', 'image', 'markdown', 'forward']
  results: InferProtoModelInput<typeof Msg.Message>[]
  children: InferProtoModelInput<typeof Msg.Elem>[]
  deleteAfterSentFiles: string[]
  isGroup: boolean
  seq: number
  tsum: number
  preview: string
  news: { text: string }[]
  name?: string
  uin?: number

  constructor(private ctx: Context, private peer: Peer) {
    this.results = []
    this.children = []
    this.deleteAfterSentFiles = []
    this.isGroup = peer.chatType === 2
    this.seq = Math.trunc(Math.random() * 65430)
    this.tsum = 0
    this.preview = ''
    this.news = []
  }

  async flush() {
    if (this.children.length === 0) return

    const nick = this.name || selfInfo.nick || 'QQ用户'

    if (this.news.length < 4) {
      this.news.push({
        text: `${nick}: ${this.preview}`
      })
    }

    this.results.push({
      routingHead: {
        fromUin: this.uin ?? +selfInfo.uin, // 或 1094950020
        c2c: this.isGroup ? undefined : {
          friendName: nick
        },
        group: this.isGroup ? {
          groupCode: 284840486,
          groupCard: nick
        } : undefined
      },
      contentHead: {
        msgType: this.isGroup ? 82 : 9,
        random: Math.floor(Math.random() * 4294967290),
        msgSeq: this.seq,
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
          elems: this.children
        }
      }
    })

    this.seq++
    this.tsum++
    this.children = []
    this.preview = ''
  }

  async packImage(data: RichMediaUploadCompleteNotify, busiType: number) {
    const imageSize = await this.ctx.ntFileApi.getImageSize(data.filePath)
    return {
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
                  picFormat: imageSize.type === 'gif' ? 2000 : 1000
                },
                width: imageSize.width,
                height: imageSize.height,
                time: 0,
                original: 1
              },
              fileUuid: data.fileId,
              storeID: 1,
              expire: this.isGroup ? 2678400 : 157680000
            },
            pic: {
              urlPath: `/download?appid=${this.isGroup ? 1407 : 1406}&fileid=${data.fileId}`,
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
              fromScene: this.isGroup ? 2 : 1, // 怀旧版 PCQQ 私聊收图需要
              toScene: this.isGroup ? 2 : 1, // 怀旧版 PCQQ 私聊收图需要
              oldFileId: this.isGroup ? 574859779 : undefined // 怀旧版 PCQQ 群聊收图需要
            },
            busiType
          }
        }),
        businessType: this.isGroup ? 20 : 10
      }
    }
  }

  packForwardMessage(resid: string) {
    const uuid = crypto.randomUUID()
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
        filename: uuid,
        tsum: 0,
      }),
      meta: {
        detail: {
          news: [{
            text: '查看转发消息'
          }],
          resid,
          source: '聊天记录',
          summary: '查看转发消息',
          uniseq: uuid,
        }
      },
      prompt: '[聊天记录]',
      ver: '0.0.0.5',
      view: 'contact'
    })
    return {
      lightApp: {
        data: Buffer.concat([Buffer.from([1]), deflateSync(Buffer.from(content, 'utf-8'))])
      }
    }
  }

  async visit(content: OutgoingForwardedMessage) {
    this.uin = content.user_id
    this.name = content.sender_name
    for (const segment of content.segments) {
      const { type, data } = segment
      if (type === 'text') {
        this.children.push({
          text: {
            str: data.text
          }
        })
        this.preview += data.text
      } else if (type === 'face') {
        this.children.push({
          face: {
            index: +data.face_id
          }
        })
        const face = faceConfig.sysface.find(e => e.QSid === data.face_id)
        if (face) {
          this.preview += face.QDes
        }
      } else if (type === 'image') {
        const imageBuffer = await resolveMilkyUri(segment.data.uri)
        const tempPath = path.join(TEMP_DIR, `image-${randomUUID()}`)
        await writeFile(tempPath, imageBuffer)
        const data = await this.ctx.ntFileApi.uploadRMFileWithoutMsg(tempPath, this.isGroup ? 4 : 3, this.isGroup ? this.peer.peerUid : selfInfo.uid)
        unlink(tempPath).catch(e => { })
        const busiType = segment.data.sub_type === 'sticker' ? 1 : 0
        this.children.push(await this.packImage(data, busiType))
        this.preview += busiType === 1 ? '[动画表情]' : '[图片]'
      }
    }
    await this.flush()
  }

  async render(content: OutgoingForwardedMessage[]) {
    for (const item of content) {
      await this.visit(item)
    }
  }

  async generate(content: OutgoingForwardedMessage[]) {
    await this.render(content)
    return {
      multiMsgItems: [{
        fileName: 'MultiMsg',
        buffer: {
          msg: this.results
        }
      }],
      tsum: this.tsum,
      source: this.isGroup ? '群聊的聊天记录' : '聊天记录',
      summary: `查看${this.tsum}条转发消息`,
      news: this.news
    }
  }
}
