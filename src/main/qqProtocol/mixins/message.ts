import { Action, Msg, Oidb } from '@/ntqqapi/proto'
import { selfInfo } from '@/common/globalVars'
import { randomBytes } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { InferProtoModelInput } from '@saltify/typeproto'
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
      // Lagrange BotMessage.ClientSequence: Random.NextInt64(10000, 99999)
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
      // 参考 Lagrange：clientSequence 不为 0 用它，否则用 sequence
      const seq = (resp.clientSequence && resp.clientSequence !== 0n)
        ? resp.clientSequence
        : resp.sequence
      return {
        sequence: seq,
        timestamp: resp.sendTime,
        random,
      }
    }
  }
}
