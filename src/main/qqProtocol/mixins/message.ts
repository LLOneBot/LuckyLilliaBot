import { Action, Msg, Oidb } from '@/ntqqapi/proto'
import { Cmd } from '../direct-lib/cmd'
import { selfInfo } from '@/common/globalVars'
import { randomBytes } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { InferProtoModelInput } from '@saltify/typeproto'
import { AppInfo, DeviceInfo } from '../direct-lib/appInfo'
import { getActiveProfile } from '../direct-lib/profiles'
import type { QQProtocolBase } from '../base'

export function MessageMixin<T extends abstract new (...args: any[]) => QQProtocolBase>(Base: T) {
  abstract class Mixed extends Base {
    async uploadForward(peerUid: string, isGroup: boolean, items: InferProtoModelInput<typeof Msg.PbMultiMsgItem>[]) {
      const transmit = Msg.PbMultiMsgTransmit.encode({ pbItemList: items })
      const data = Action.SendLongMsgReq.encode({
        info: {
          type: isGroup ? 3 : 1,
          peer: { uid: isGroup ? peerUid : selfInfo.uid },
          groupCode: isGroup ? +peerUid : 0,
          payload: gzipSync(transmit),
        },
        settings: { field1: 4, field2: 1, field3: 7, field4: 0 },
      })
      const res = await this.sendPB(Cmd.Message.SendLongMsg, data)
      return Action.SendLongMsgResp.decode(Buffer.from(res.pb, 'hex'))
    }

    async getMultiMsg(resId: string) {
      const data = Action.RecvLongMsgReq.encode({
        info: {
          peer: { uid: selfInfo.uid },
          resId,
          acquire: true,
        },
        settings: { field1: 2, field2: 0, field3: 0, field4: 0 },
      })
      const res = await this.sendPB(Cmd.Message.RecvLongMsg, data)
      const payload = Action.RecvLongMsgResp.decode(Buffer.from(res.pb, 'hex')).result.payload
      const inflate = gunzipSync(payload)
      return Msg.PbMultiMsgTransmit.decode(inflate)
    }

    async pullPics(word: string) {
      const data = Action.PullPicsReq.encode({
        uin: +selfInfo.uin,
        field3: 1,
        word,
        word2: word,
        field8: 0,
        field9: 0,
        field14: 1,
      })
      const res = await this.sendPB(Cmd.Message.PullPics, data)
      return Action.PullPicsResp.decode(Buffer.from(res.pb, 'hex'))
    }

    async fetchAiCharacterList(groupId: number, chatType: number) {
      const body = Oidb.FetchAiCharacterListReq.encode({ groupId, chatType })
      const data = Oidb.Base.encode({ command: 0x929d, subCommand: 0, body })
      const res = await this.sendPB(Cmd.Message.FetchAiCharacterList, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.FetchAiCharacterListResp.decode(oidbRespBody)
    }

    async getGroupGenerateAiRecord(groupId: number, character: string, text: string, chatType: number) {
      const msgRandom = randomBytes(4).readUInt32BE(0)
      const body = Oidb.GetGroupGenerateAiRecordReq.encode({
        groupId,
        voiceId: character,
        text,
        chatType,
        clientMsgInfo: { msgRandom },
      })
      const data = Oidb.Base.encode({ command: 0x929b, subCommand: 0, body })
      await this.sendPB(Cmd.Message.GetGroupGenerateAiRecord, data)
      return { msgRandom }
    }

    async getGroupMessages(groupCode: number, startSequence: number, endSequence: number) {
      const data = Action.SsoGetGroupMsgReq.encode({
        groupInfo: { groupCode, startSequence, endSequence },
        filter: 1,
      })
      const res = await this.sendPB(Cmd.Message.GetGroupMsg, data)
      return Action.SsoGetGroupMsgResp.decode(Buffer.from(res.pb, 'hex'))
    }

    async getC2CMessages(peerUid: string, startSequence: number, endSequence: number) {
      const data = Action.SsoGetC2CMsgReq.encode({ peerUid, startSequence, endSequence })
      const res = await this.sendPB(Cmd.Message.GetC2cMsg, data)
      return Action.SsoGetC2CMsgResp.decode(Buffer.from(res.pb, 'hex'))
    }

    /**
     * 不知道 seq 时按时间拉。direction=1 往更早翻, count 最多 30; 取最新 N 条传 time=0xFFFFFFFA, 避开本地时钟偏差
     */
    async getC2CRoamMessages(peerUid: string, time: number, count: number, direction: 1 | 2 = 1) {
      const data = Action.SsoGetRoamMsgReq.encode({
        peerUid,
        time,
        random: 0,
        count: Math.min(count, 30),
        direction,
      })
      const res = await this.sendPB(Cmd.Message.GetRoamMsg, data)
      return Action.SsoGetRoamMsgResp.decode(Buffer.from(res.pb, 'hex'))
    }

    async recallGroupMessage(groupCode: number, sequence: number) {
      const data = Action.SsoGroupRecallMsgReq.encode({
        type: 1,
        groupCode,
        info: { sequence },
      })
      await this.sendPB(Cmd.Message.RecallGroup, data)
    }

    /** 只返回 ack, 文字经 MsgPush (528 / 61) 异步推回: 调用方监听 `nt/ptt-trans-result`, 按 msgUid 匹配 */
    async pttTransGroupReq(opts: {
      msgUid: bigint
      senderUin: number
      groupUin: number
      voiceMd5Hex: string
      voiceFileId: string
    }) {
      const data = Msg.PttTransGroupReq.encode({
        field1: 1,
        body: {
          msgUid: opts.msgUid,
          senderUin: opts.senderUin,
          groupUin: opts.groupUin,
          field4: 0,
          voiceMd5Hex: opts.voiceMd5Hex,
          field6: 3,
          field7: 5142, // 抓包常量, 跟版本有关
          field8: 1,
          voiceFileId: opts.voiceFileId,
          field10: 0,
        },
        field5: 1,
        field6: 1,
        field10: 0,
      })
      await this.sendPB(Cmd.Message.TransGroupPtt, data)
    }

    /** 结果同样经 MsgPush (528 / 61) 推回 */
    async pttTransC2CReq(opts: {
      msgUid: bigint
      senderUin: number
      receiverUin: number
      voiceMd5Hex: string
      voiceFileId: string
    }) {
      const data = Msg.PttTransC2CReq.encode({
        field1: 2,
        body: {
          msgUid: opts.msgUid,
          senderUin: opts.senderUin,
          receiverUin: opts.receiverUin,
          voiceFileId: opts.voiceFileId,
          field5: 7,
          field6: 14144, // 抓包常量
          field7: 1,
          field8: 0,
          voiceMd5Hex: opts.voiceMd5Hex,
        },
        field5: 1,
        field6: 1,
        field10: 0,
      })
      await this.sendPB(Cmd.Message.TransC2CPtt, data)
    }

    async listFavEmojis() {
      const data = Msg.FaceroamOpReq.encode({
        comm: { imPlat: getActiveProfile().imPlat, osVersion: DeviceInfo.osVer, qVersion: AppInfo.currentVersion },
        selfUin: BigInt(selfInfo.uin),
        subCmd: 1,
        field6: 1,
      })
      const res = await this.sendPB(Cmd.Message.ListFavEmojis, data)
      return Msg.FaceroamListResp.decode(Buffer.from(res.pb, 'hex'))
    }

    /** emojiIds 形如 `{uin}_0_0_0_{MD5_HEX_UPPER}_0_0` */
    async deleteFavEmojis(emojiIds: string[]) {
      const data = Msg.FaceroamOpReq.encode({
        comm: { imPlat: getActiveProfile().imPlat, osVersion: DeviceInfo.osVer },
        selfUin: BigInt(selfInfo.uin),
        subCmd: 2,
        deleteList: emojiIds.map(id => ({ emojiId: id })),
      })
      const res = await this.sendPB(Cmd.Message.ListFavEmojis, data)
      return Msg.FaceroamDeleteResp.decode(Buffer.from(res.pb, 'hex'))
    }

    /** 拿到 uKey 后用 HighwayHttpSession (cmd=9, ticket=uKey) 上传, 传完 server 自动加进收藏 */
    async addFavEmojiPrep(opts: { md5: Buffer, fileSize: number }) {
      const data = Msg.BDHExpressionRoamReq.encode({
        field1: 3,
        field2: 1,
        body: {
          field1: 0,
          uin: BigInt(selfInfo.uin),
          field3: 0,
          md5: opts.md5,
          fileSize: opts.fileSize,
          field7: 2,
          field8: 8,
          field9: 1,
          version: '1.0.0',
          field16: 1,
        },
        commandId: 9,
        extension: Buffer.from('0a07080010001a01301001', 'hex'), // 抓包常量
      })
      const res = await this.sendPB(Cmd.Message.AddFavEmojiPrep, data)
      return Msg.BDHExpressionRoamResp.decode(Buffer.from(res.pb, 'hex'))
    }

    async recallC2CMessage(targetUid: string, clientSequence: number, random: number, timestamp: number, c2cMsgSeq: number) {
      const data = Action.SsoC2CRecallMsgReq.encode({
        type: 1,
        targetUid,
        info: {
          clientSequence,
          random,
          messageUid: (BigInt(0x01000000) << 32n) | BigInt(random),
          timestamp,
          field5: 0,
          c2cMsgSeq,
        },
        field5: { field1: 0, field2: 0 },
        field6: 0,
      })
      await this.sendPB(Cmd.Message.RecallC2C, data)
    }

    /** 只支持文本 / At / 表情 / 回复, 不含媒体 */
    async sendMessage(opts: {
      chatType: number
      groupCode?: number
      toUin?: number
      toUid?: string
      elems: InferProtoModelInput<typeof Msg.Elem>[]
      /** 预先生成的话可以用来匹配 OlPush 回声的 contentHead.random */
      random?: number
      content?: Buffer
    }) {
      const random = opts.random ?? randomBytes(4).readUInt32BE(0)
      const clientSequence = 10000 + Math.floor(Math.random() * 90000)
      const data = Msg.PbSendMsg.encode({
        routingHead: opts.content ? {
          trans0X211: {
            toUin: opts.toUin,
            ccCmd: 4,
            uid: opts.toUid,
          }
        } : {
          1: { c2c: { toUin: opts.toUin, toUid: opts.toUid } },
          2: { group: { groupCode: opts.groupCode } },
          100: { groupTemp: { groupCode: opts.groupCode, toUid: opts.toUid } }
        }[opts.chatType],
        contentHead: { pkgNum: 1, pkgIndex: 0, divSeq: 0, autoReply: 0 },
        body: {
          richText: {
            elems: opts.elems
          },
          msgContent: opts.content
        },
        clientSequence,
        random,
      })
      const res = await this.sendPB(Cmd.Message.Send, data)
      const resp = Msg.PbSendMsgResp.decode(Buffer.from(res.pb, 'hex'))
      // 群聊 groupMsgSeq 所有人一致, 接收方在 OlPush 82 的 contentHead f5 拿到同一个值;
      // 私聊 c2cMsgSeq 双端一致, 接收方在 OlPush 166 的 contentHead f11 拿到
      const seq = resp.groupMsgSeq || resp.c2cMsgSeq!
      return {
        resultCode: resp.resultCode,
        errMsg: resp.errMsg ?? '',
        sequence: seq,
        timestamp: resp.sendTime,
        random,
        clientSequence,
      }
    }

    /** trans 0x211 + FileExtra */
    async sendC2CFileMessage(opts: {
      toUin: number
      toUid: string
      fileUuid: string
      fileName: string
      fileSize: number
      file10MMd5: Buffer
      crcMedia: string
    }) {
      const random = randomBytes(4).readUInt32BE(0)
      const clientSequence = 10000 + Math.floor(Math.random() * 90000)
      const expireTime = Math.floor(Date.now() / 1000) + 7 * 24 * 3600
      const msgContent = Msg.FileExtra.encode({
        file: {
          fileType: 0,
          fileUuid: opts.fileUuid,
          fileMd5: opts.file10MMd5,
          fileName: opts.fileName,
          fileSize: opts.fileSize,
          subCmd: 1,
          dangerLevel: 0,
          expireTime,
          fileIdCrcMedia: opts.crcMedia,
        }
      })
      const data = Msg.PbSendMsg.encode({
        routingHead: {
          trans0X211: {
            toUin: opts.toUin,
            ccCmd: 4,
            uid: opts.toUid,
          },
        },
        contentHead: { pkgNum: 1, pkgIndex: 0, divSeq: 0, autoReply: 0 },
        body: { msgContent },
        clientSequence,
        random,
      })
      const res = await this.sendPB(Cmd.Message.Send, data)
      const resp = Msg.PbSendMsgResp.decode(Buffer.from(res.pb, 'hex'))
      return {
        resultCode: resp.resultCode,
        errMsg: resp.errMsg,
        sequence: resp.c2cMsgSeq,
        timestamp: resp.sendTime,
        random,
        // 调用方要补 nt/message-sent 回声: clientSequence 给撤回用, expireTime 进 fileElement
        clientSequence,
        expireTime,
      }
    }

    async fetchMsgEmojiLikes(groupCode: number, msgSeq: number, emojiCode: string, count: number, cookie: string) {
      const body = Oidb.FetchEmojiLikesReq.encode({
        groupCode,
        msgSeq,
        chatType: 1,
        emojiCode,
        cookie,
        field7: 0,
        count,
      })
      const data = Oidb.Base.encode({ command: 0x9083, subCommand: 1, body })
      const res = await this.sendPB(Cmd.Message.FetchMsgEmojiLikes, data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      return Oidb.FetchEmojiLikesResp.decode(decoded.body)
    }

    async reportMessageRead(chatType: number, peerUid: string, startSequence: number) {
      const isGroup = chatType === 2
      const data = Action.SsoReadedReportReq.encode({
        group: isGroup ? {
          groupCode: +peerUid,
          startSequence
        } : undefined,
        c2c: !isGroup ? {
          targetUid: peerUid,
          startSequence
        } : undefined
      })
      const res = await this.sendPB(Cmd.Message.ReadedReport, data)
      return Action.SsoReadedReportResp.decode(Buffer.from(res.pb, 'hex'))
    }

    async setInputStatus(toUid: string, eventType: number) {
      const body = Oidb.SetInputStatusReq.encode({
        body: {
          toUid,
          field2: 0,
          eventType
        }
      })
      const data = Oidb.Base.encode({ command: 0xcd4, subCommand: 1, body })
      const res = await this.sendPB(Cmd.Message.SetInputStatus, data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.SetInputStatusResp.decode(oidbRespBody)
    }
  }
  return Mixed
}
