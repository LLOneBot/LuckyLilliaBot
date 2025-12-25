import { BaseAction, Schema } from '../BaseAction'
import { OB11Message } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { ParseMessageConfig } from '@/onebot11/types'
import { ChatType, RawMessage } from '@/ntqqapi/types'
import { MsgInfo } from '../../../main/store'

export interface PayloadType {
  message_id: number | string
}

export type ReturnDataType = OB11Message

class GetMsg extends BaseAction<PayloadType, OB11Message> {
  actionName = ActionName.GetMsg
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required()
  })

  private createMsgInfoFromMessage(msgId: string, msg: RawMessage): MsgInfo {
    return {
      msgId,
      peer: {
        chatType: msg.chatType,
        peerUid: msg.peerUid,
        guildId: ''
      }
    }
  }

  protected async _handle(payload: PayloadType, config: ParseMessageConfig) {
    let msgInfo = await this.ctx.store.getMsgInfoByShortId(+payload.message_id)
    if (!msgInfo) {
      const msgId = String(payload.message_id)
      const shortId = await this.ctx.store.getShortIdByMsgId(msgId)
      if (shortId) {
        msgInfo = await this.ctx.store.getMsgInfoByShortId(shortId)
      } else {
        const cacheMsg = this.ctx.store.getMsgCache(msgId)
        if (cacheMsg) {
          msgInfo = this.createMsgInfoFromMessage(msgId, cacheMsg)
        } else {
          const c2cMsg = await this.ctx.ntMsgApi.queryMsgsById(ChatType.C2C, msgId)
          if (c2cMsg.msgList.length > 0) {
            msgInfo = this.createMsgInfoFromMessage(msgId, c2cMsg.msgList[0])
          } else {
            const groupMsg = await this.ctx.ntMsgApi.queryMsgsById(ChatType.Group, msgId)
            if (groupMsg.msgList.length > 0) {
              msgInfo = this.createMsgInfoFromMessage(msgId, groupMsg.msgList[0])
            }
          }
        }
      }
    }
    if (!msgInfo) {
      throw new Error('消息不存在')
    }
    let msg = this.ctx.store.getMsgCache(msgInfo.msgId)
    if (!msg) {
      const res = await this.ctx.ntMsgApi.getMsgsByMsgId(msgInfo.peer, [msgInfo.msgId])
      if (res.msgList.length === 0) {
        throw new Error('无法获取该消息')
      }
      msg = res.msgList[0]
    }
    const retMsg = await OB11Entities.message(this.ctx, msg, undefined, undefined, config)
    if (!retMsg) {
      throw new Error('消息为空')
    }
    retMsg.real_id = retMsg.message_seq
    return retMsg
  }
}

export default GetMsg
