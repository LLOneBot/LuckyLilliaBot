import { Peer } from '@/ntqqapi/types'
import { createHash } from 'node:crypto'
import { LimitedHashTable } from '@/common/utils/table'
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
      chatType: number
      peerUid: string
    }
    file_v2: FileCacheV2
  }
}

interface MsgInfo {
  msgId: string
  peer: Peer
}

export default class Store extends Service {
  static inject = ['database', 'model']
  private cache: LimitedHashTable<string, number>

  constructor(protected ctx: Context) {
    super(ctx, 'store', true)
    this.cache = new LimitedHashTable<string, number>(1000)
    this.initDatabase()
  }

  private async initDatabase() {
    this.ctx.model.extend('message', {
      shortId: 'integer(10)',
      chatType: 'unsigned',
      msgId: 'string(24)',
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
  }

  createMsgShortId(peer: Peer, msgId: string): number {
    const cacheKey = `${msgId}|${peer.chatType}|${peer.peerUid}`
    const hash = createHash('md5').update(cacheKey).digest()
    hash[0] &= 0x7f //设置第一个bit为0 保证shortId为正数
    const shortId = hash.readInt32BE()
    this.cache.set(cacheKey, shortId)
    this.ctx.database.upsert('message', [{
      msgId,
      shortId,
      chatType: peer.chatType,
      peerUid: peer.peerUid
    }], 'shortId').then()
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

  getShortIdByMsgInfo(peer: Peer, msgId: string) {
    const cacheKey = `${msgId}|${peer.chatType}|${peer.peerUid}`
    return this.cache.getValue(cacheKey)
  }

  addFileCache(data: FileCacheV2) {
    return this.ctx.database.upsert('file_v2', [data], 'fileUuid')
  }

  getFileCacheByName(fileName: string) {
    return this.ctx.database.get('file_v2', { fileName }, {
      sort: { msgTime: 'desc' }
    })
  }

  getFileCacheById(fileUuid: string) {
    return this.ctx.database.get('file_v2', { fileUuid })
  }
}
