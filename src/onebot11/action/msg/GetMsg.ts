import { BaseAction, Schema } from '../BaseAction'
import { OB11Message } from '../../types'
import { OB11Entities } from '../../entities'
import { ActionName } from '../types'
import { ParseMessageConfig } from '@/onebot11/types'
import { ChatType } from '@/ntqqapi/types'

export interface PayloadType {
  message_id: number | string
}

export type ReturnDataType = OB11Message

class GetMsg extends BaseAction<PayloadType, OB11Message> {
  actionName = ActionName.GetMsg
  payloadSchema = Schema.object({
    message_id: Schema.union([Number, String]).required()
  })

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
          msgInfo = {
            msgId,
            peer: {
              chatType: cacheMsg.chatType,
              peerUid: cacheMsg.peerUid,
              guildId: ''
            }
          }
        } else {
          const c2cMsg = await this.ctx.ntMsgApi.queryMsgsById(1, msgId)
          if (c2cMsg.msgList.length > 0) {
            msgInfo = {
              msgId,
              peer: {
                chatType: c2cMsg.msgList[0].chatType,
                peerUid: c2cMsg.msgList[0].peerUid,
                guildId: ''
              }
            }
          } else {
            const groupMsg = await this.ctx.ntMsgApi.queryMsgsById(2, msgId)
            if (groupMsg.msgList.length > 0) {
              msgInfo = {
                msgId,
                peer: {
                  chatType: groupMsg.msgList[0].chatType,
                  peerUid: groupMsg.msgList[0].peerUid,
                  guildId: ''
                }
              }
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
