import { Action, Msg, Oidb } from '@/ntqqapi/proto'
import { selfInfo } from '@/common/globalVars'
import { randomBytes } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { InferProtoModelInput } from '@saltify/typeproto'
import { AppInfo, DeviceInfo } from '../direct/appInfo'
import type { QQProtocolBase } from '../base'

export function MessageMixin<T extends new (...args: any[]) => QQProtocolBase>(Base: T) {
  return class extends Base {
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
      const res = await this.sendPB('trpc.group.long_msg_interface.MsgService.SsoSendLongMsg', data)
      return Action.SendLongMsgResp.decode(Buffer.from(res.pb, 'hex')).result!.resId!
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
      const res = await this.sendPB('trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg', data)
      const payload = Action.RecvLongMsgResp.decode(Buffer.from(res.pb, 'hex')).result.payload
      if (payload.length === 0) {
        throw new Error('获取合并转发消息内容失败')
      }
      const inflate = gunzipSync(payload)
      return Msg.PbMultiMsgTransmit.decode(inflate).pbItemList
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
      const res = await this.sendPB('PicSearchSvr.PullPics', data)
      return Action.PullPicsResp.decode(Buffer.from(res.pb, 'hex'))
    }

    async fetchAiCharacterList(groupId: number, chatType: number) {
      const body = Oidb.FetchAiCharacterListReq.encode({ groupId, chatType })
      const data = Oidb.Base.encode({ command: 0x929d, subCommand: 0, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x929d_0', data)
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
      await this.sendPB('OidbSvcTrpcTcp.0x929b_0', data)
      return { msgRandom }
    }

    /** 拉群历史消息（按 seq 范围）。返回 Msg.Message 解码后的对象列表（routingHead/contentHead/body） */
    async getGroupMessages(groupCode: number, startSequence: number, endSequence: number) {
      const data = Action.SsoGetGroupMsgReq.encode({
        groupInfo: { groupCode, startSequence, endSequence },
        filter: 1,
      })
      const res = await this.sendPB('trpc.msg.register_proxy.RegisterProxy.SsoGetGroupMsg', data)
      const decoded = Action.SsoGetGroupMsgResp.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.retcode !== 0) {
        throw new Error(`获取群消息失败: ${decoded.errorMsg}`)
      }
      // body.messages 是 bytes[]，每个是序列化的 Msg.Message，需要再解一次
      return (decoded.body.messages || []).map((buf: Uint8Array) => Msg.Message.decode(Buffer.from(buf)))
    }

    /** 拉私聊历史消息（按 seq 范围） */
    async getC2CMessages(peerUid: string, startSequence: number, endSequence: number) {
      const data = Action.SsoGetC2CMsgReq.encode({ peerUid, startSequence, endSequence })
      const res = await this.sendPB('trpc.msg.register_proxy.RegisterProxy.SsoGetC2CMsg', data)
      const decoded = Action.SsoGetC2CMsgResp.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.retcode !== 0) {
        throw new Error(`获取私聊消息失败: ${decoded.errorMsg}`)
      }
      return (decoded.messages || []).map((buf: Uint8Array) => Msg.Message.decode(Buffer.from(buf)))
    }

    /** 撤回群消息 */
    async recallGroupMessage(groupCode: number, sequence: number) {
      const data = Action.SsoGroupRecallMsgReq.encode({
        type: 1,
        groupCode,
        info: { sequence },
      })
      await this.sendPB('trpc.msg.msg_svc.MsgService.SsoGroupRecallMsg', data)
    }

    /**
     * 群语音转文字（提交请求）。服务端立即返回 ack；转写文字通过 MsgPush msgType=528 subType=61 异步推回。
     * 调用方负责监听 `nt/ptt-trans-result` 事件，按 msgUid 匹配。
     */
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
          field7: 5142, // 抓包看到的常量；版本相关
          field8: 1,
          voiceFileId: opts.voiceFileId,
          field10: 0,
        },
        field5: 1,
        field6: 1,
        field10: 0,
      })
      await this.sendPB('pttTrans.TransGroupPttReq', data)
    }

    /** 私聊语音转文字。结果同样走 MsgPush msgType=528 subType=61。 */
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
          field6: 14144, // 抓包看到的常量
          field7: 1,
          field8: 0,
          voiceMd5Hex: opts.voiceMd5Hex,
        },
        field5: 1,
        field6: 1,
        field10: 0,
      })
      await this.sendPB('pttTrans.TransC2CPttReq', data)
    }

    /** 收藏表情列表（Faceroam.OpReq subCmd=1）。返回每个表情的 emoji_id（含 md5）+ bid + 配额。 */
    async listFavEmojis() {
      const data = Msg.FaceroamOpReq.encode({
        comm: { imPlat: 1, osVersion: DeviceInfo.osVer, qVersion: AppInfo.currentVersion },
        selfUin: BigInt(selfInfo.uin),
        subCmd: 1,
        field6: 1,
      })
      const res = await this.sendPB('Faceroam.OpReq', data)
      return Msg.FaceroamListResp.decode(Buffer.from(res.pb, 'hex'))
    }

    /** 删除收藏表情（Faceroam.OpReq subCmd=2）。emojiIds 形如 `{uin}_0_0_0_{MD5_HEX_UPPER}_0_0`。 */
    async deleteFavEmojis(emojiIds: string[]) {
      const data = Msg.FaceroamOpReq.encode({
        comm: { imPlat: 1, osVersion: DeviceInfo.osVer },
        selfUin: BigInt(selfInfo.uin),
        subCmd: 2,
        deleteList: emojiIds.map(id => ({ emojiId: id })),
      })
      const res = await this.sendPB('Faceroam.OpReq', data)
      return Msg.FaceroamDeleteResp.decode(Buffer.from(res.pb, 'hex'))
    }

    /**
     * 申请上传收藏表情。返回 uKey + 上传服务器 IP/端口 + 最终 emoji_id。
     * 拿到后用 HighwayHttpSession（cmd=9, ticket=uKey）上传图片字节流。
     * 服务端收到完整文件后会自动加进用户收藏列表。
     */
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
        extension: Buffer.from('0a07080010001a01301001', 'hex'), // 抓包看到的常量子结构
      })
      const res = await this.sendPB('ImgStore.BDHExpressionRoam', data)
      return Msg.BDHExpressionRoamResp.decode(Buffer.from(res.pb, 'hex'))
    }

    /** 撤回私聊消息 */
    async recallC2CMessage(targetUid: string, clientSequence: number, random: number, timestamp: number, ntMsgSeq: number) {
      const data = Action.SsoC2CRecallMsgReq.encode({
        type: 1,
        targetUid,
        info: {
          clientSequence,
          random,
          messageUid: (BigInt(0x01000000) << 32n) | BigInt(random),
          timestamp,
          field5: 0,
          ntMsgSeq,
        },
        field5: { field1: 0, field2: 0 },
        field6: 0,
      })
      await this.sendPB('trpc.msg.msg_svc.MsgService.SsoC2CRecallMsg', data)
    }

    /** 发消息（仅文本/At/表情/回复，不含媒体） */
    async sendMessage(opts: {
      isGroup: boolean
      groupCode?: number
      toUin?: number
      toUid?: string
      elems: InferProtoModelInput<typeof Msg.Elem>[]
    }) {
      const random = randomBytes(4).readUInt32BE(0)
      // BotMessage.ClientSequence: Random.NextInt64(10000, 99999)
      const clientSequence = 10000 + Math.floor(Math.random() * 90000)
      const data = Msg.PbSendMsg.encode({
        routingHead: opts.isGroup
          ? { group: { groupCode: opts.groupCode! } }
          : { c2c: { toUin: opts.toUin, toUid: opts.toUid } },
        contentHead: { pkgNum: 1, pkgIndex: 0, divSeq: 0, autoReply: 0 },
        body: { richText: { elems: opts.elems } },
        clientSequence,
        random,
      })
      const res = await this.sendPB('MessageSvc.PbSendMsg', data)
      const resp = Msg.PbSendMsgResp.decode(Buffer.from(res.pb, 'hex'))
      if (resp.resultCode !== 0) {
        throw new Error(`发送消息失败 (code=${resp.resultCode}): ${resp.errMsg || ''}`)
      }
      // group 用 server-assigned group msgSeq；C2C 用 clientSequence（C2C 没有 group seq 概念）
      const seq = opts.isGroup
        ? (resp.sequence || resp.clientSequence)
        : ((resp.clientSequence && resp.clientSequence !== 0n) ? resp.clientSequence : resp.sequence)
      return {
        sequence: seq,
        timestamp: resp.sendTime,
        random,
      }
    }

    /** 发送 C2C 离线文件消息（trans 0x211 + FileExtra）。upload + feed by send-msg。 */
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
            toUin: BigInt(opts.toUin),
            ccCmd: 4,
            uid: opts.toUid,
          },
        },
        contentHead: { pkgNum: 1, pkgIndex: 0, divSeq: 0, autoReply: 0 },
        body: { msgContent },
        clientSequence,
        random,
      })
      const res = await this.sendPB('MessageSvc.PbSendMsg', data)
      const resp = Msg.PbSendMsgResp.decode(Buffer.from(res.pb, 'hex'))
      return {
        resultCode: resp.resultCode,
        errMsg: resp.errMsg,
        sequence: (resp.clientSequence && resp.clientSequence !== 0n) ? resp.clientSequence : resp.sequence,
        timestamp: resp.sendTime,
        random,
      }
    }

    /** 拉取消息表情回应用户列表 (OidbSvcTrpcTcp.0x9083_1) */
    async fetchMsgEmojiLikes(groupCode: number, msgSeq: number, emojiCode: string, count: number) {
      const body = Oidb.FetchEmojiLikesReq.encode({
        groupCode,
        msgSeq,
        chatType: 1,
        emojiCode,
        cookie: Buffer.alloc(0),
        field7: 0,
        count,
      })
      const data = Oidb.Base.encode({ command: 0x9083, subCommand: 1, body })
      const res = await this.sendPB('OidbSvcTrpcTcp.0x9083_1', data)
      const decoded = Oidb.Base.decode(Buffer.from(res.pb, 'hex'))
      if (decoded.errorCode !== 0) {
        throw new Error(`fetchMsgEmojiLikes failed: errorCode=${decoded.errorCode}, errorMsg="${decoded.errorMsg}"`)
      }
      const resp = Oidb.FetchEmojiLikesResp.decode(Buffer.from(decoded.body))
      return {
        users: resp.users ?? [],
        totalCount: resp.totalCount ?? 0,
        hasMore: !!resp.hasMore,
      }
    }
  }
}
