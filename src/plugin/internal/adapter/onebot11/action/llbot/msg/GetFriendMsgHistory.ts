import { BaseAction, Schema } from '../../BaseAction'
import { OB11Message } from '@/plugin/internal/adapter/onebot11/types'
import { ActionName } from '../../types'
import { ChatType, Peer } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import { OB11Entities } from '@/plugin/internal/adapter/onebot11/entities'
import { mapWithConcurrency, parseBool } from '@/common/utils/misc'
import { ParseMessageConfig } from '@/plugin/internal/adapter/onebot11/types'

interface Payload {
  user_id: number | string
  message_seq?: number | string
  count: number | string
  reverseOrder: boolean
}

interface Response {
  messages: OB11Message[]
}

export class GetFriendMsgHistory extends BaseAction<Payload, Response> {
  actionName = ActionName.GetFriendMsgHistory
  payloadSchema = Schema.object({
    user_id: Schema.union([Number, String]).required(),
    message_seq: Schema.union([Number, String]),
    count: Schema.union([Number, String]).default(20),
    reverseOrder: Schema.union([Boolean, Schema.transform(String, parseBool)]).default(false)
  })

  private async fetchRangeRaw(peer: Peer, startSeq: number, endSeq: number) {
    const resp = await this.ctx.ntMsgApi.getMsgsBySeqAndCount(peer, endSeq, endSeq - startSeq + 1, true)
    return resp.msgList
  }

  protected async _handle(payload: Payload, config: ParseMessageConfig): Promise<Response> {
    const uid = await this.ctx.ntUserApi.getUidByUin(+payload.user_id)
    if (!uid) throw new Error(`无法获取用户信息`)
    const isBuddy = await this.ctx.ntFriendApi.isFriend(uid)
    const peer: Peer = {
      chatType: isBuddy ? ChatType.C2C : ChatType.TempC2CFromGroup,
      peerUid: uid
    }

    const count = +payload.count
    if (count === 0) return { messages: [] }

    const endSeq = (payload.message_seq && +payload.message_seq > 0)
      ? +payload.message_seq
      : await this.ctx.ntMsgApi.getLatestMsgSeq(peer)
    const overallStartSeq = Math.max(1, endSeq - count + 1)

    const windows: Array<{ start: number, end: number }> = []
    for (let cur = endSeq; cur >= overallStartSeq; cur -= 30) {
      const start = Math.max(overallStartSeq, cur - 30 + 1)
      windows.push({ start, end: cur })
    }

    const rawBatches = await mapWithConcurrency(
      windows,
      5,
      (w) => this.fetchRangeRaw(peer, w.start, w.end),
      (r) => r.length === 0
    )

    const firstEmpty = rawBatches.findIndex((r) => r.length === 0)
    // rawBatches 存在空数组时，可能以 undefined 结尾
    const validBatches = firstEmpty === -1 ? rawBatches : rawBatches.slice(0, firstEmpty)
    validBatches.reverse()

    // 窗口都非空却不够 count: 区间里有 seq 空洞 (撤回 / 过滤), 继续往更早补拉, 直到够数或到头
    const flatRaw = validBatches.flat()
    if (firstEmpty === -1 && flatRaw.length < count) {
      let remaining = count - flatRaw.length
      let nextEndSeq = windows.at(-1)!.start - 1
      while (remaining > 0 && nextEndSeq >= 1) {
        const fetchCount = Math.min(30, remaining)
        const startSeq = Math.max(1, nextEndSeq - fetchCount + 1)
        const batch = await this.fetchRangeRaw(peer, startSeq, nextEndSeq)
        if (batch.length === 0) break
        // 保持 server 原始顺序前置拼接 (与并发批次 reverse().flat() 一致)
        flatRaw.unshift(...batch)
        remaining -= batch.length
        nextEndSeq = startSeq - 1
      }
    }

    const messages = await Promise.all(
      flatRaw.map(msg => OB11Entities.message(this.ctx, msg, config))
    )

    if (payload.reverseOrder) messages.reverse()
    return { messages }
  }
}
