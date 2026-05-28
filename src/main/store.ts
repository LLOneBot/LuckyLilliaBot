import { Peer, RawMessage } from '@/ntqqapi/types'
import { createHash } from 'node:crypto'
import { BidiMap } from '@/common/utils/table'
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
      groupId: string
      userId: string
      card: string
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
  static inject = ['database', 'model']
  private cache: BidiMap<string, number>
  private messages: Map<string, RawMessage>

  constructor(protected ctx: Context, public config: Store.Config) {
    super(ctx, 'store')
    this.cache = new BidiMap(1000)
    this.messages = new Map()
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

  createMsgShortId(msg: RawMessage): number {
    const cacheKey = `${msg.msgId}|${msg.msgSeq}|${msg.chatType}|${msg.peerUid}`
    const existingShortId = this.cache.getValue(cacheKey)
    if (existingShortId) {
      return existingShortId
    }
    const hash = createHash('md5').update(cacheKey).digest()
    const shortId = hash.readInt32BE() // OneBot 11 要求 message_id 为 int32
    this.cache.set(cacheKey, shortId)
    this.ctx.database.upsert('message', [{
      msgId: msg.msgId,
      shortId,
      chatType: msg.chatType,
      peerUid: msg.peerUid,
      msgSeq: msg.msgSeq
    }], ['shortId']).catch(e => this.ctx.logger.warn(e))
    return shortId
  }

  async getMsgInfoByShortId(shortId: number): Promise<MsgInfo | undefined> {
    const data = this.cache.getKey(shortId)
    if (data) {
      const [msgId, msgSeq, chatTypeStr, peerUid] = data.split('|')
      return {
        msgId,
        msgSeq: +msgSeq,
        peer: {
          chatType: +chatTypeStr,
          peerUid,
          guildId: ''
        }
      }
    }
    const items = await this.ctx.database.get('message', { shortId })
    if (items.length) {
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

  getMsgBySeq(peer: Peer, msgSeq: number) {
    return this.messages.values()
      .find(e => e.peerUid === peer.peerUid && e.chatType === peer.chatType && e.msgSeq === msgSeq)
  }

  getMsgByMsgId(msgId: string) {
    return this.messages.get(msgId)
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
