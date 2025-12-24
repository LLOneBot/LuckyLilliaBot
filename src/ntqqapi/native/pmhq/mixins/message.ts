import { Action, Msg, Oidb } from '@/ntqqapi/proto'
import { Peer, ChatType } from '@/ntqqapi/types/msg'
import { selfInfo } from '@/common/globalVars'
import { randomBytes } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { InferProtoModelInput } from '@saltify/typeproto'
import type { PMHQBase } from '../base'

export function MessageMixin<T extends new (...args: any[]) => PMHQBase>(Base: T) {
  return class extends Base {
    async uploadForward(peer: Peer, items: InferProtoModelInput<typeof Msg.PbMultiMsgItem>[]) {
      const transmit = Msg.PbMultiMsgTransmit.encode({ pbItemList: items })
      const isGroup = peer.chatType === ChatType.Group
      const data = Action.SendLongMsgReq.encode({
        info: {
          type: isGroup ? 3 : 1,
          peer: { uid: isGroup ? peer.peerUid : selfInfo.uid },
          groupCode: isGroup ? +peer.peerUid : 0,
          payload: gzipSync(transmit),
        },
        settings: { field1: 4, field2: 1, field3: 7, field4: 0 },
      })
      const res = await this.httpSendPB('trpc.group.long_msg_interface.MsgService.SsoSendLongMsg', data)
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
      const res = await this.httpSendPB('trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg', data)
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
      const res = await this.httpSendPB('PicSearchSvr.PullPics', data)
      return Action.PullPicsResp.decode(Buffer.from(res.pb, 'hex'))
    }

    async fetchAiCharacterList(groupId: number, chatType: number) {
      const body = Oidb.FetchAiCharacterListReq.encode({ groupId, chatType })
      const data = Oidb.Base.encode({ command: 0x929d, subCommand: 0, body })
      const res = await this.httpSendPB('OidbSvcTrpcTcp.0x929d_0', data)
      const oidbRespBody = Oidb.Base.decode(Buffer.from(res.pb, 'hex')).body
      return Oidb.FetchAiCharacterListResp.decode(oidbRespBody)
    }

    async getGroupGenerateAiRecord(groupId: number, character: string, text: string, chatType: number) {
      const body = Oidb.GetGroupGenerateAiRecordReq.encode({
        groupId,
        voiceId: character,
        text,
        chatType,
        clientMsgInfo: { msgRandom: randomBytes(4).readUInt32BE(0) },
      })
      const data = Oidb.Base.encode({ command: 0x929b, subCommand: 0, body })
      await this.httpSendPB('OidbSvcTrpcTcp.0x929b_0', data)
    }
  }
}
