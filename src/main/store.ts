import { ChatType, Peer, RawMessage } from '@/ntqqapi/types'
import { createHash } from 'node:crypto'
import { BidiMap } from '@/common/utils/table'
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
      uniqueMsgId: string
      chatType: number
      peerUid: string
      msgSeq: string
    }
    file: FileCache
    forward: {
      rootMsgId: string
      parentMsgId: string
      chatType: number
      peerUid: string
    },
    group_member: {
      groupId: string
      userId: string
      card: string
    },
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
  msgSeq?: string
  peer: Peer
}

class Store extends Service {
  static inject = ['database', 'model']
  private cache: BidiMap<string, number>
  private messages: Map<string, RawMessage>
  private latestPeerSeq: Map<string, number>

  constructor(protected ctx: Context, public config: Store.Config) {
    super(ctx, 'store')
    this.cache = new BidiMap(1000)
    this.messages = new Map()
    this.latestPeerSeq = new Map()
  }

  async [Service.init]() {
    this.start()
    return noop
  }

  start() {
    this.initDatabase().then().catch(console.error)
    this.ctx.on('llob/config-updated', async input => {
      this.config = { msgCacheExpire: input.msgCacheExpire! }
    })
  }

  private async initDatabase() {
    this.ctx.model.extend('message', {
      shortId: 'integer(10)',
      chatType: 'unsigned',
      msgId: 'string(24)',
      uniqueMsgId: 'string(64)',
      peerUid: 'string(24)',
      msgSeq: 'string(20)'
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
      originImageUrl: 'string',
    }, {
      primary: 'fileUuid',
      indexes: ['fileName']
    })
    this.ctx.model.extend('forward', {
      rootMsgId: 'string(24)',
      parentMsgId: 'string(24)',
      chatType: 'unsigned',
      peerUid: 'string(24)'
    }, {
      primary: 'parentMsgId'
    })
    this.ctx.model.extend('group_member', {
      groupId: 'string(10)',
      userId: 'string(10)',
      card: 'string(60)'
    }, {
      primary: ['groupId', 'userId']
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

  getUniqueMsgId(msg: RawMessage): string {
    // msgSeq 不能进 hash —— 发送方 PbSendMsgResp.sequence 跟接收方 OlPush.contentHead.msgSeq
    // 不一定相等（forward / 自身回声等场景特别明显），同一条消息算出来的 shortId 会两头对不上。
    // peerUid + msgRandom 已经能唯一定位（msgRandom 是 server 在两端都广播一致的 32-bit 值）。
    // C2C 双向时发送方 senderUid 是自己、对方 senderUid 是对方，所以另用 (selfUid, otherUid)
    // 排序后的 pair + msgRandom 作为 key。
    if (msg.chatType === ChatType.C2C || msg.chatType === ChatType.TempC2CFromGroup) {
      const me = selfInfo.uid
      const other = msg.senderUid === me ? msg.peerUid : msg.senderUid
      const pair = me < other ? `${me}|${other}` : `${other}|${me}`
      return `${msg.chatType}-${pair}-${msg.msgRandom}`
    }
    return `${msg.chatType}-${msg.peerUid}-${msg.msgRandom}`
  }

  createMsgShortId(msg: RawMessage): number {
    const peer = {
      chatType: msg.chatType,
      peerUid: msg.peerUid,
      guildId: ''
    }
    const existingShortId = this.getShortIdByMsgInfo(peer, msg.msgId)
    if (existingShortId) {
      return existingShortId
    }
    // QQ 本地给的 msgId 是和 Protobuf 给的不一致
    // 并且本地的 msgId 是根据一个本地保存的随机字符串 + 某种算法生成的，如果将 QQ 数据库清空了，这个随机字符串会变
    // 这就导致每次清空数据库后收到的同一条消息的 msgId 都不一样
    // 所以这里改成用 msgSeq + msgRandom 来生成 shortId，保证清空 QQ 数据库后收到同一条消息收到 shortId 都一致
    const uniqueMsgId = this.getUniqueMsgId(msg)
    const hash = createHash('md5').update(uniqueMsgId).digest()
    const shortId = hash.readInt32BE() // OneBot 11 要求 message_id 为 int32
    const cacheKey = `${msg.msgId}|${peer.chatType}|${peer.peerUid}`
    this.cache.set(cacheKey, shortId)
    this.ctx.database.upsert('message', [{
      msgId: msg.msgId,
      uniqueMsgId,
      shortId,
      chatType: peer.chatType,
      peerUid: peer.peerUid,
      msgSeq: msg.msgSeq
    }], ['shortId']).catch(e => this.ctx.logger.warn(e))
    return shortId
  }

  async getMsgInfoByShortId(shortId: number): Promise<MsgInfo | undefined> {
    const data = this.cache.getKey(shortId)
    if (data) {
      const [msgId, chatTypeStr, peerUid] = data.split('|')
      const item = (await this.ctx.database.get('message', { shortId }))[0]
      return {
        msgId,
        msgSeq: item?.msgSeq,
        peer: {
          chatType: +chatTypeStr,
          peerUid,
          guildId: ''
        }
      }
    }
    const items = await this.ctx.database.get('message', { shortId })
    if (items?.length) {
      const { msgId, chatType, peerUid, msgSeq } = items[0]
      return {
        msgId,
        msgSeq,
        peer: {
          chatType,
          peerUid,
          guildId: ''
        }
      }
    }
  }

  async getShortIdByMsgId(msgId: string): Promise<number | undefined> {
    return (await this.ctx.database.get('message', { msgId }))[0]?.shortId
  }

  async getMsgSeqByMsgId(msgId: string): Promise<string | undefined> {
    const seq = (await this.ctx.database.get('message', { msgId }))[0]?.msgSeq
    return seq && +seq > 0 ? seq : undefined
  }

  async getShortIdByUniqueMsgId(uniqueMsgId: string): Promise<number | undefined> {
    return (await this.ctx.database.get('message', { uniqueMsgId }))[0]?.shortId
  }

  async checkMsgExist(msg: RawMessage): Promise<boolean> {
    const uniqueMsgId = this.getUniqueMsgId(msg)
    const existingShortId = await this.getShortIdByUniqueMsgId(uniqueMsgId)
    return !!existingShortId
  }

  getShortIdByMsgInfo(peer: Peer, msgId: string) {
    const cacheKey = `${msgId}|${peer.chatType}|${peer.peerUid}`
    return this.cache.getValue(cacheKey)
  }

  async addFileCache(data: FileCache) {
    // 判断 fileUuid 是否存在
    const existingFile = await this.ctx.database.get('file', { fileUuid: data.fileUuid })
    if (existingFile.length) {
      return existingFile
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
    if (this.messages.size > 10000) {
      // 如果缓存超过10000条，清理最早的
      const firstKey = this.messages.keys().next().value
      this.messages.delete(firstKey!)
    }
    setTimeout(() => {
      this.messages.delete(id)
    }, expire * 1000)
  }

  getMsgCache(msgId: string) {
    return this.messages.get(msgId)
  }

  /** 记录某个会话的最新 msgSeq —— 没存 server 端 seq 时拉"最新 N 条"用 */
  setLatestPeerSeq(chatType: ChatType, peerUid: string, seq: number) {
    if (!seq || seq <= 0) return
    const key = `${chatType}:${peerUid}`
    const prev = this.latestPeerSeq.get(key) || 0
    if (seq > prev) this.latestPeerSeq.set(key, seq)
  }

  getLatestPeerSeq(chatType: ChatType, peerUid: string): number | undefined {
    return this.latestPeerSeq.get(`${chatType}:${peerUid}`)
  }

  /** 在内存 cache 中按 (peerUid, msgSeq) 查找消息（撤回事件用） */
  findCachedMsgByPeerSeq(peerUid: string, msgSeq: string): RawMessage | undefined {
    for (const m of this.messages.values()) {
      if (m.peerUid === peerUid && m.msgSeq === msgSeq) return m
    }
    return undefined
  }

  addMultiMsgInfo(rootMsgId: string, parentMsgId: string, peer: Peer) {
    this.ctx.database.upsert('forward', [{
      rootMsgId,
      parentMsgId,
      chatType: peer.chatType,
      peerUid: peer.peerUid
    }])
      .catch(e => this.ctx.logger.warn(e))
  }

  getMultiMsgInfo(parentMsgId: string) {
    return this.ctx.database.get('forward', { parentMsgId })
  }

  async getGroupMemberCard(groupId: string, userId: string): Promise<string | undefined> {
    const items = await this.ctx.database.get('group_member', { groupId, userId })
    return items[0]?.card
  }

  async setGroupMemberCard(groupId: string, userId: string, card: string) {
    return await this.ctx.database.upsert('group_member', [{
      groupId,
      userId,
      card
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
