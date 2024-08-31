import fsPromise from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import Database, { Tables } from 'minato'
import SQLite from '@minatojs/driver-sqlite'
import { Peer } from '@/ntqqapi/types'
import { createHash } from 'node:crypto'
import { LimitedHashTable } from './table'
import { DATA_DIR } from '../globalVars'
import { FileCacheV2 } from '../types'

interface SQLiteTables extends Tables {
    message: {
        shortId: number
        msgId: string
        chatType: number
        peerUid: string
    }
    file_v2: FileCacheV2
}

interface MsgIdAndPeerByShortId {
    MsgId: string
    Peer: Peer
}

// forked from https://github.com/NapNeko/NapCatQQ/blob/6f6b258f22d7563f15d84e7172c4d4cbb547f47e/src/common/utils/MessageUnique.ts#L84
class MessageUniqueWrapper {
    private msgDataMap: LimitedHashTable<string, number>
    private msgIdMap: LimitedHashTable<string, number>
    private db: Database<SQLiteTables> | undefined

    constructor(maxMap: number = 1000) {
        this.msgIdMap = new LimitedHashTable<string, number>(maxMap)
        this.msgDataMap = new LimitedHashTable<string, number>(maxMap)
    }

    async init(uin: string) {
        const dbDir = path.join(DATA_DIR, 'database')
        if (!fs.existsSync(dbDir)) {
            await fsPromise.mkdir(dbDir)
        }
        const database = new Database<SQLiteTables>()
        await database.connect(SQLite, {
            path: path.join(dbDir, `${uin}.db`)
        })
        database.extend('message', {
            shortId: 'integer(10)',
            chatType: 'unsigned',
            msgId: 'string(24)',
            peerUid: 'string(24)'
        }, {
            primary: 'shortId'
        })
        database.extend('file_v2', {
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
        this.db = database
    }

    async getRecentMsgIds(Peer: Peer, size: number): Promise<string[]> {
        const heads = this.msgIdMap.getHeads(size)
        if (!heads) {
            return []
        }
        const data: (MsgIdAndPeerByShortId | undefined)[] = []
        for (const t of heads) {
            data.push(await MessageUnique.getMsgIdAndPeerByShortId(t.value))
        }
        const ret = data.filter((t) => t?.Peer.chatType === Peer.chatType && t?.Peer.peerUid === Peer.peerUid)
        return ret.map((t) => t?.MsgId).filter((t) => t !== undefined)
    }

    createMsg(peer: Peer, msgId: string): number {
        const key = `${msgId}|${peer.chatType}|${peer.peerUid}`
        const hash = createHash('md5').update(key).digest()
        //设置第一个bit为0 保证shortId为正数
        hash[0] &= 0x7f
        const shortId = hash.readInt32BE(0)
        //减少性能损耗
        // const isExist = this.msgIdMap.getKey(shortId)
        // if (isExist && isExist === msgId) {
        //   return shortId
        // }
        this.msgIdMap.set(msgId, shortId)
        this.msgDataMap.set(key, shortId)
        this.db?.upsert('message', [{
            msgId,
            shortId,
            chatType: peer.chatType,
            peerUid: peer.peerUid
        }], 'shortId').then()
        return shortId
    }

    async getMsgIdAndPeerByShortId(shortId: number): Promise<MsgIdAndPeerByShortId | undefined> {
        const data = this.msgDataMap.getKey(shortId)
        if (data) {
            const [msgId, chatTypeStr, peerUid] = data.split('|')
            const peer: Peer = {
                chatType: parseInt(chatTypeStr),
                peerUid,
                guildId: '',
            }
            return { MsgId: msgId, Peer: peer }
        }
        const items = await this.db?.get('message', { shortId })
        if (items?.length) {
            const { msgId, chatType, peerUid } = items[0]
            return {
                MsgId: msgId,
                Peer: {
                    chatType,
                    peerUid,
                    guildId: '',
                }
            }
        }
        return undefined
    }

    getShortIdByMsgId(msgId: string): number | undefined {
        return this.msgIdMap.getValue(msgId)
    }

    async getPeerByMsgId(msgId: string) {
        const shortId = this.msgIdMap.getValue(msgId)
        if (!shortId) return undefined
        return await this.getMsgIdAndPeerByShortId(shortId)
    }

    resize(maxSize: number): void {
        this.msgIdMap.resize(maxSize)
        this.msgDataMap.resize(maxSize)
    }

    addFileCache(data: FileCacheV2) {
        return this.db?.upsert('file_v2', [data], 'fileUuid')
    }

    getFileCacheByName(fileName: string) {
        return this.db?.get('file_v2', { fileName }, {
            sort: { msgTime: 'desc' }
        })
    }

    getFileCacheById(fileUuid: string) {
        return this.db?.get('file_v2', { fileUuid })
    }
}

export const MessageUnique: MessageUniqueWrapper = new MessageUniqueWrapper()