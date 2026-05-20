import { BaseAction, Schema } from '../../BaseAction'
import { ActionName } from '../../types'

interface Payload {
  character: string
  group_id: number | string
  text: string
  chat_type: number | string
}

interface Response {
  message_id: number
}

export class SendGroupAiRecord extends BaseAction<Payload, Response> {
  actionName = ActionName.SendGroupAiRecord
  payloadSchema = Schema.object({
    character: Schema.string().required(),
    group_id: Schema.union([Number, String]).required(),
    text: Schema.string().required(),
    chat_type: Schema.union([Number, String]).default(1),
  })

  async _handle(payload: Payload) {
    // 监听必须在 OIDB 调用之前注册：服务器 broadcast 可能在 OIDB 响应之前就到达。
    // AI record 是自己触发的，回推会走 nt/raw/self-send-msg（不是 nt/message-created）。
    const seen: any[] = []
    let targetMsgRandom: string | null = null
    const { promise, resolve } = Promise.withResolvers<Response>()
    const checkAndResolve = (msg: any) => {
      if (targetMsgRandom !== null && msg.msgRandom === targetMsgRandom) {
        dispose()
        const shortId = this.ctx.store.createMsgShortId(msg)
        resolve({ message_id: shortId })
        return true
      }
      return false
    }
    const dispose = this.ctx.on('nt/raw/self-send-msg', (msg: any) => {
      if (!checkAndResolve(msg)) {
        seen.push(msg)
      }
    })
    try {
      const res = await this.ctx.qqProtocol.getGroupGenerateAiRecord(+payload.group_id, payload.character, payload.text, +payload.chat_type)
      targetMsgRandom = res.msgRandom.toString()
      for (const msg of seen) {
        if (checkAndResolve(msg)) break
      }
    } catch (e) {
      dispose()
      throw e
    }
    return promise
  }
}
