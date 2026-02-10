import { Peer, RawMessage } from '@/ntqqapi/types'
import { createHash } from 'node:crypto'
import { BidiMap } from '@/common/utils/table'
import { FileCacheV2 } from '@/common/types'
import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    store: Store
  }
  interface Tables {
    message: {
      shortId: number
      msgId: string
      uniqueMsgId: string
      chatType: number
      peerUid: string
    }
    file_v2: FileCacheV2
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
    }
  }
}

export interface MsgInfo {
  msgId: string
  peer: Peer
}

class Store extends Service {
  static inject = ['database', 'model']
  private cache: BidiMap<string, number>
  private messages: Map<string, RawMessage>

  constructor(protected ctx: Context, public config: Store.Config) {
    super(ctx, 'store', true)
    this.cache = new BidiMap(1000)
    this.messages = new Map()
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
      peerUid: 'string(24)'
    }, {
      primary: 'shortId'
    })
    this.ctx.model.extend('file_v2', {
      fileName: 'string',
      fileSize: 'string',
      fileUuid: 'string(128)',
      msgId: 'string(24)',
      msgTime: 'unsigned(10)',
      peerUid: 'string(24)',
      chatType: 'unsigned',
      elementId: 'string(24)',
      elementType: 'unsigned',
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
  }

  getUniqueMsgId(msg: RawMessage): string {
    return `${msg.chatType}-${msg.peerUid}-${msg.msgSeq}-${msg.msgRandom}-${msg.msgTime}`
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
      peerUid: peer.peerUid
    }], ['shortId']).then().catch(e => this.ctx.logger.error('createMsgShortId database error:', e))
    return shortId
  }

  async getMsgInfoByShortId(shortId: number): Promise<MsgInfo | undefined> {
    const data = this.cache.getKey(shortId)
    if (data) {
      const [msgId, chatTypeStr, peerUid] = data.split('|')
      return {
        msgId,
        peer: {
          chatType: +chatTypeStr,
          peerUid,
          guildId: ''
        }
      }
    }
    const items = await this.ctx.database.get('message', { shortId })
    if (items?.length) {
      const { msgId, chatType, peerUid } = items[0]
      return {
        msgId,
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

  async addFileCache(data: FileCacheV2) {
    // 判断 fileUuid 是否存在
    const existingFile = await this.ctx.database.get('file_v2', { fileUuid: data.fileUuid })
    if (existingFile.length) {
      return existingFile
    }
    this.ctx.database.upsert('file_v2', [data], 'fileUuid').then()
      .catch(e => this.ctx.logger.error('addFileCache database error:', e))
  }

  getFileCacheByName(fileName: string) {
    return this.ctx.database.get('file_v2', { fileName }, {
      sort: { msgTime: 'desc' }
    })
  }

  getFileCacheById(fileUuid: string) {
    return this.ctx.database.get('file_v2', { fileUuid })
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

  addMultiMsgInfo(rootMsgId: string, parentMsgId: string, peer: Peer) {
    this.ctx.database.upsert('forward', [{
      rootMsgId,
      parentMsgId,
      chatType: peer.chatType,
      peerUid: peer.peerUid
    }]).then()
      .catch(e => this.ctx.logger.error('addMultiMsgInfo database error:', e))
  }

  getMultiMsgInfo(parentMsgId: string) {
    return this.ctx.database.get('forward', { parentMsgId })
  }

  async getGroupMemberCard(groupId: string, userId: string): Promise<string | undefined> {
    const items = await this.ctx.database.get('group_member', { groupId, userId })
    return items[0]?.card
  }

  setGroupMemberCard(groupId: string, userId: string, card: string) {
    return this.ctx.database.upsert('group_member', [{
      groupId,
      userId,
      card
    }])
  }
}

namespace Store {
  export interface Config {
    /** 单位为秒 */
    msgCacheExpire: number
  }
}

export default Store
