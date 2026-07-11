import { ChatType, Peer, RawMessage } from '@/ntqqapi/types'
import { createHash } from 'node:crypto'
import { FileCache } from '@/common/types'
import { Context, Service } from 'cordis'
import { noop } from 'cosmokit'
import { selfInfo } from '@/common/globalVars'

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
  static inject = ['database', 'model', 'timer']
  private ids: Map<string, number>
  private messages: Map<string, RawMessage>
  private msgTimestamps: Map<string, number>
  private sweepTimer?: () => void

  constructor(protected ctx: Context, public config: Store.Config) {
    super(ctx, 'store')
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
   * shortId hash 输入。要保证同一条消息在不同时机/不同视角算出来一致。
   *
   * 群消息：peerUid (= groupCode) 和 msgSeq 是 server 全局分配，所有人视角一致；msgRandom
   *   server 在两端原样广播也一致。msgId（contentHead.msgUid）在 OlPush 推回 vs SsoGetGroupMsg
   *   拉历史时**不一样**，不能放进 hash 输入。
   * C2C：peerUid 是各自视角对方的 uid（双端不同），不能进 hash。RawMessage.msgSeq 在私聊里
   *   语义是 c2cMsgSeq（server 给这条消息的全局 c2c msgSeq，双端理论上一致），但本端 send
   *   时还没拿到它（PbSendMsgResp 同步返回有，但收到 self-echo 之前 store 里这条消息字段
   *   不一定齐），所以稳妥起见 hash 输入只用两端都立刻能拿到的 (selfUid, otherUid) 排序对
   *   + msgRandom（client 自造，server 在两端原样广播，永远一致）。
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
      const me = selfInfo.uid
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
      // 如果缓存超过1000条，清理最早的
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
    // 始终走 DB —— cache 的 key 用规范化字符串（C2C 用 uid-pair-random），不再可逆。
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

  /** 按 (peerUid, msgRandom) 反查 cache —— C2C 撤回 push 里 sequence/msgSeq 不可靠，random 是
   *  server 在两端原样广播的 32-bit 值，是双端唯一对得上的 key。 */
  getMsgByRandom(peerUid: string, msgRandom: number) {
    return this.messages.values()
      .find(e => e.peerUid === peerUid && e.msgRandom === msgRandom)
  }

  getMsgByMsgId(msgId: string) {
    return this.messages.get(msgId)
  }

  async addFileCache(data: FileCache) {
    // 判断 fileUuid 是否存在
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
    // 本地时间可能跟消息时间存在差异，以本地时间为准
    this.msgTimestamps.set(id, Date.now())
    if (this.messages.size > 10000) {
      // 如果缓存超过10000条，清理最早的
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
