import { Context } from 'cordis'
import { OB11MessageData, OB11MessageDataType } from '../types'
import { Msg, RichMedia } from '@/ntqqapi/proto/compiled'
import { handleOb11RichMedia } from './createMessage'
import { selfInfo } from '@/common/globalVars'
import { Peer, RichMediaUploadCompleteNotify } from '@/ntqqapi/types'
import { deflateSync } from 'node:zlib'
import faceConfig from '@/ntqqapi/helper/face_config.json'

export class MessageEncoder {
  static support = ['text', 'face', 'image', 'markdown', 'forward']
  results: Msg.Message[]
  children: Msg.Elem[]
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
        fromUin: this.uin ?? +selfInfo.uin ?? 1094950020,
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
        field15: {
          field1: 0,
          field2: 0,
          field3: 0,
          field4: '',
          field5: ''
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
        pbElem: RichMedia.MsgInfo.encode({
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
              expire: 2678400
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
              summary: ''
            },
            busiType
          }
        }).finish(),
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

  async visit(segment: OB11MessageData) {
    const { type, data } = segment
    if (type === OB11MessageDataType.Node) {
      await this.render(data.content as OB11MessageData[])
      const id = data.uin ?? data.user_id
      this.uin = id ? +id : undefined
      this.name = data.name ?? data.nickname
      await this.flush()
    } else if (type === OB11MessageDataType.Text) {
      this.children.push({
        text: {
          str: data.text
        }
      })
      this.preview += data.text
    } else if (type === OB11MessageDataType.Face) {
      this.children.push({
        face: {
          index: +data.id
        }
      })
      const face = faceConfig.sysface.find(e => e.QSid === String(data.id))
      if (face) {
        this.preview += face.QDes
      }
    } else if (type === OB11MessageDataType.Image) {
      const { path } = await handleOb11RichMedia(this.ctx, segment, this.deleteAfterSentFiles)
      const data = await this.ctx.ntFileApi.uploadRMFileWithoutMsg(path, this.isGroup ? 4 : 3, this.peer.peerUid)
      const busiType = Number(segment.data.subType) || 0
      this.children.push(await this.packImage(data, busiType))
      this.preview += busiType === 1 ? '[动画表情]' : '[图片]'
    } else if (type === OB11MessageDataType.Markdown) {
      this.children.push({
        commonElem: {
          serviceType: 45,
          pbElem: Msg.MarkdownElem.encode(data).finish(),
          businessType: 1
        }
      })
    } else if (type === OB11MessageDataType.Forward) {
      this.children.push(this.packForwardMessage(data.id))
      this.preview += '[聊天记录]'
    }
  }

  async render(segments: OB11MessageData[]) {
    for (const segment of segments) {
      await this.visit(segment)
    }
  }

  async generate(content: any[]) {
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
