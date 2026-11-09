import { ChatType, Peer, RawMessage } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'
import { createHash } from 'node:crypto'
import { FileCache } from '@/common/types'
import { Context, Service } from 'cordis'
import { noop } from 'cosmokit'

declare module 'cordis' {
  interface Context {
    store: Store
  }
}

declare module '@cordisjs/plugin-database' {
  interface Tables {
    message: {
      shortId: number
      msgId: string
      chatType: number
      peerUid: string
      msgSeq: number
    }
    file: FileCache
    group_member: {
      groupCode: number
      uin: number
      cardName: string
    }
    uix: {
      uid: string
      uin: number
    }
    temp_chat_info: {
      peerUid: string
      groupCode: number
    }
  }
}

export interface MsgInfo {
  msgId: string
  msgSeq: number
  peer: Peer
}

class Store extends Service {
  static inject = ['database', 'model', 'timer', 'qqProtocol']
  private readonly selfUid: string
  private ids: Map<string, number>
  private messages: Map<string, RawMessage>
  private msgTimestamps: Map<string, number>
  private sweepTimer?: () => void

  constructor(protected ctx: Context, public config: Store.Config) {
    super(ctx, 'store')
    this.selfUid = ctx.qqProtocol.selfInfo.uid
    this.ids = new Map()
    this.messages = new Map()
    this.msgTimestamps = new Map()
  }

  async [Service.init]() {
    this.start()
    return noop
  }

  start() {
    this.initDatabase().catch(e => this.ctx.logger.error(e))
    this.ctx.on('llob/config-updated', async input => {
      this.config = { msgCacheExpire: input.msgCacheExpire! }
    })
  }

  private async initDatabase() {
    this.ctx.model.extend('message', {
      shortId: 'integer(10)',
      chatType: 'unsigned',
      msgId: 'string(24)',
      peerUid: 'string(24)',
      msgSeq: 'unsigned(10)'
    }, {
      primary: 'shortId'
    })
    this.ctx.model.extend('file', {
      fileName: 'string',
      fileSize: 'string',
      fileUuid: 'string(128)',
      msgTime: 'unsigned(10)',
      peerUid: 'string(24)',
      chatType: 'unsigned',
      elementType: 'unsigned',
      md5HexStr: 'string(32)',
      originImageUrl: 'string'
    }, {
      primary: 'fileUuid',
      indexes: ['fileName']
    })
    this.ctx.model.extend('group_member', {
      groupCode: 'unsigned(10)',
      uin: 'unsigned(10)',
      cardName: 'string(60)'
    }, {
      primary: ['groupCode', 'uin']
    })
    this.ctx.model.extend('uix', {
      uid: 'string(24)',
      uin: 'unsigned(10)'
    }, {
      primary: 'uid',
      indexes: ['uin']
    })
    this.ctx.model.extend('temp_chat_info', {
      peerUid: 'string(24)',
      groupCode: 'unsigned(10)'
    }, {
      primary: 'peerUid'
    })
  }

  /**
   * 同一条消息在不同时机 / 视角必须算出同一个 key。群: groupCode + msgSeq + msgRandom 所有人一致, msgId 在推送和
   * 拉历史时不一样, 不能用。C2C: 双端的 peerUid 不同, 本端发送时也未必有 c2cMsgSeq, 所以只用排好序的
   * (selfUid, otherUid) + msgRandom
   */
  private buildShortIdKey(meta: {
    msgId: string
    msgSeq: number
    msgRandom: number
    peerUid: string
    senderUid: string
    chatType: ChatType
  }): string {
    if (meta.chatType === ChatType.C2C || meta.chatType === ChatType.TempC2CFromGroup) {
      const me = this.selfUid
      const other = meta.senderUid === me ? meta.peerUid : meta.senderUid
      const pair = me < other ? `${me}|${other}` : `${other}|${me}`
      return `${meta.chatType}-${pair}-${meta.msgRandom}`
    }
    return `${meta.chatType}-${meta.peerUid}-${meta.msgSeq}-${meta.msgRandom}`
  }

  createMsgShortId(meta: {
    msgId: string
    msgSeq: number
    msgRandom: number
    peerUid: string
    senderUid: string
    chatType: ChatType
  }): number {
    const cacheKey = this.buildShortIdKey(meta)
    const existingShortId = this.ids.get(cacheKey)
    if (existingShortId) {
      return existingShortId
    }
    const hash = createHash('md5').update(cacheKey).digest()
    const shortId = hash.readInt32BE() // OneBot 11 要求 message_id 为 int32
    this.ids.set(cacheKey, shortId)
    if (this.ids.size > 1000) {
      const firstKey = this.ids.keys().next().value
      this.ids.delete(firstKey!)
    }
    this.ctx.database.upsert('message', [{
      msgId: meta.msgId,
      shortId,
      chatType: meta.chatType,
      peerUid: meta.peerUid,
      msgSeq: meta.msgSeq
    }], ['shortId']).catch(e => this.ctx.logger.warn(e))
    return shortId
  }

  async getMsgInfoByShortId(shortId: number): Promise<MsgInfo | undefined> {
    // 只能查 DB: cache 的 key 不可逆
    const items = await this.ctx.database.get('message', { shortId })
    if (items.length) {
      const { msgId, chatType, peerUid, msgSeq } = items[0]
      return {
        msgId,
        msgSeq,
        peer: {
          chatType,
          peerUid
        }
      }
    }
  }

  getMsgBySeq(peerUid: string, msgSeq: number) {
    return this.messages.values()
      .find(e => e.peerUid === peerUid && e.msgSeq === msgSeq)
  }

  /** C2C 撤回推送里的 seq 不可靠, random 是双端唯一对得上的字段 */
  getMsgByRandom(peerUid: string, msgRandom: number) {
    return this.messages.values()
      .find(e => e.peerUid === peerUid && e.msgRandom === msgRandom)
  }

  getMsgByMsgId(msgId: string) {
    return this.messages.get(msgId)
  }

  async addFileCache(data: FileCache) {
    const existingFile = await this.ctx.database.get('file', { fileUuid: data.fileUuid })
    if (existingFile.length) {
      return
    }
    this.ctx.database.upsert('file', [data], 'fileUuid')
      .catch(e => this.ctx.logger.warn(e))
  }

  getFileCacheByName(fileName: string) {
    return this.ctx.database.get('file', { fileName }, {
      sort: { msgTime: 'desc' }
    })
  }

  getFileCacheById(fileUuid: string) {
    return this.ctx.database.get('file', { fileUuid })
  }

  async addMsgCache(msg: RawMessage) {
    const expire = this.config.msgCacheExpire
    if (expire === 0) {
      return
    }
    const id = msg.msgId
    this.messages.set(id, msg)
    // 用本地时间, 消息时间可能有偏差
    this.msgTimestamps.set(id, Date.now())
    if (this.messages.size > 10000) {
      const firstKey = this.messages.keys().next().value
      this.messages.delete(firstKey!)
      this.msgTimestamps.delete(firstKey!)
    }
    if (!this.sweepTimer) {
      const sweepMs = Math.max(5000, expire * 200)
      this.sweepTimer = this.ctx.interval(() => this.sweepExpired(), sweepMs)
    }
  }

  private sweepExpired() {
    const now = Date.now()
    const expireMs = this.config.msgCacheExpire * 1000
    for (const [id, ts] of this.msgTimestamps) {
      if (now - ts >= expireMs) {
        this.messages.delete(id)
        this.msgTimestamps.delete(id)
      } else {
        break
      }
    }
    if (this.messages.size === 0 && this.sweepTimer) {
      this.sweepTimer()
      this.sweepTimer = undefined
    }
  }

  async getGroupMemberCardName(groupCode: number, uin: number): Promise<string | undefined> {
    const items = await this.ctx.database.get('group_member', { groupCode, uin })
    return items[0]?.cardName
  }

  async setGroupMemberCardName(groupCode: number, uin: number, cardName: string) {
    return await this.ctx.database.upsert('group_member', [{
      groupCode,
      uin,
      cardName
    }])
  }

  async addUix(uix: { uid: string, uin: number }[]) {
    return await this.ctx.database.upsert('uix', uix)
  }

  async getUinByUid(uid: string): Promise<number | undefined> {
    const items = await this.ctx.database.get('uix', { uid })
    return items[0]?.uin
  }

  async getUidByUin(uin: number): Promise<string | undefined> {
    const items = await this.ctx.database.get('uix', { uin })
    return items[0]?.uid
  }

  async addTempChatInfo(info: { peerUid: string, groupCode: number }) {
    return await this.ctx.database.upsert('temp_chat_info', [info])
  }

  async getTempChatInfo(peerUid: string): Promise<{
    peerUid: string
    groupCode: number
  } | undefined> {
    const items = await this.ctx.database.get('temp_chat_info', { peerUid })
    return items[0]
  }
}

namespace Store {
  export interface Config {
    /** 单位为秒 */
    msgCacheExpire: number
  }
}

export default Store
