import {Level} from "level";
import {type GroupNotify, RawMessage} from "../ntqqapi/types";
import {DATA_DIR, log} from "./utils";
import {selfInfo} from "./data";
import {FileCache} from "./types";


class DBUtil {
    public readonly DB_KEY_PREFIX_MSG_ID = "msg_id_";
    public readonly DB_KEY_PREFIX_MSG_SHORT_ID = "msg_short_id_";
    public readonly DB_KEY_PREFIX_MSG_SEQ_ID = "msg_seq_id_";
    public readonly DB_KEY_PREFIX_FILE = "file_";
    public readonly DB_KEY_PREFIX_GROUP_NOTIFY = "group_notify_";
    public db: Level;
    public cache: Record<string, RawMessage | string | FileCache | GroupNotify> = {}  // <msg_id_ | msg_short_id_ | msg_seq_id_><id>: RawMessage
    private currentShortId: number;

    /*
    * 数据库结构
    * msg_id_101231230999: {} // 长id: RawMessage
    * msg_short_id_1: 101231230999  // 短id: 长id
    * msg_seq_id_1: 101231230999  // 序列id: 长id
    * file_7827DBAFJFW2323.png: {} // 文件名: FileCache
    * */

    constructor() {
        let initCount = 0;
        new Promise((resolve, reject) => {
            const initDB = () => {
                initCount++;
                // if (initCount > 50) {
                //     return reject("init db fail")
                // }

                try {
                    if (!selfInfo.uin) {
                        setTimeout(initDB, 300);
                        return
                    }
                    const DB_PATH = DATA_DIR + `/msg_${selfInfo.uin}`;
                    this.db = new Level(DB_PATH, {valueEncoding: 'json'});
                    console.log("llonebot init db success")
                    resolve(null)
                } catch (e) {
                    console.log("init db fail", e.stack.toString())
                    setTimeout(initDB, 300);
                }
            }
            initDB();
        }).then()
        setInterval(() => {
            this.cache = {}
        }, 1000 * 60 * 10)
    }

    private addCache(msg: RawMessage) {
        const longIdKey = this.DB_KEY_PREFIX_MSG_ID + msg.msgId
        const shortIdKey = this.DB_KEY_PREFIX_MSG_SHORT_ID + msg.msgShortId
        const seqIdKey = this.DB_KEY_PREFIX_MSG_SEQ_ID + msg.msgSeq
        this.cache[longIdKey] = this.cache[shortIdKey] = msg
    }

    async getMsgByShortId(shortMsgId: number): Promise<RawMessage> {
        const shortMsgIdKey = this.DB_KEY_PREFIX_MSG_SHORT_ID + shortMsgId;
        if (this.cache[shortMsgIdKey]) {
            return this.cache[shortMsgIdKey] as RawMessage
        }
        const longId = await this.db.get(shortMsgIdKey);
        const msg = await this.getMsgByLongId(longId)
        this.addCache(msg)
        return msg
    }

    async getMsgByLongId(longId: string): Promise<RawMessage> {
        const longIdKey = this.DB_KEY_PREFIX_MSG_ID + longId;
        if (this.cache[longIdKey]) {
            return this.cache[longIdKey] as RawMessage
        }
        const data = await this.db.get(longIdKey)
        const msg = JSON.parse(data)
        this.addCache(msg)
        return msg
    }

    async getMsgBySeqId(seqId: string): Promise<RawMessage> {
        const seqIdKey = this.DB_KEY_PREFIX_MSG_SEQ_ID + seqId;
        if (this.cache[seqIdKey]) {
            return this.cache[seqIdKey] as RawMessage
        }
        const longId = await this.db.get(seqIdKey);
        const msg = await this.getMsgByLongId(longId)
        this.addCache(msg)
        return msg
    }

    async addMsg(msg: RawMessage) {
        // 有则更新，无则添加
        // log("addMsg", msg.msgId, msg.msgSeq, msg.msgShortId);
        const longIdKey = this.DB_KEY_PREFIX_MSG_ID + msg.msgId
        let existMsg = this.cache[longIdKey] as RawMessage
        if (!existMsg) {
            try {
                existMsg = await this.getMsgByLongId(msg.msgId)
            } catch (e) {
                // log("addMsg getMsgByLongId error", e.stack.toString())
            }
        }
        if (existMsg) {
            // log("消息已存在", existMsg.msgSeq, existMsg.msgShortId, existMsg.msgId)
            this.updateMsg(msg).then()
            return existMsg.msgShortId
        }
        this.addCache(msg);
        // log("新增消息记录", msg.msgId)
        const shortMsgId = await this.genMsgShortId();
        const shortIdKey = this.DB_KEY_PREFIX_MSG_SHORT_ID + shortMsgId;
        const seqIdKey = this.DB_KEY_PREFIX_MSG_SEQ_ID + msg.msgSeq;
        msg.msgShortId = shortMsgId;
        try {
            this.db.put(shortIdKey, msg.msgId).then();
            this.db.put(longIdKey, JSON.stringify(msg)).then();
            try {
                await this.db.get(seqIdKey)
            } catch (e) {
                // log("新的seqId", seqIdKey)
                this.db.put(seqIdKey, msg.msgId).then();
            }
            if (!this.cache[seqIdKey]) {
                this.cache[seqIdKey] = msg;
            }
            // log(`消息入库 ${seqIdKey}: ${msg.msgId}, ${shortMsgId}: ${msg.msgId}`);
        } catch (e) {
            // log("addMsg db error", e.stack.toString());
        }
        return shortMsgId
    }

    async updateMsg(msg: RawMessage) {
        const longIdKey = this.DB_KEY_PREFIX_MSG_ID + msg.msgId
        let existMsg = this.cache[longIdKey] as RawMessage
        if (!existMsg) {
            try {
                existMsg = await this.getMsgByLongId(msg.msgId)
            } catch (e) {
                existMsg = msg
            }
        }

        Object.assign(existMsg, msg)
        this.db.put(longIdKey, JSON.stringify(existMsg)).then();
        const shortIdKey = this.DB_KEY_PREFIX_MSG_SHORT_ID + existMsg.msgShortId;
        const seqIdKey = this.DB_KEY_PREFIX_MSG_SEQ_ID + msg.msgSeq;
        if (!this.cache[seqIdKey]) {
            this.cache[seqIdKey] = existMsg;
        }
        this.db.put(shortIdKey, msg.msgId).then();
        try {
            await this.db.get(seqIdKey)
        } catch (e) {
            this.db.put(seqIdKey, msg.msgId).then();
            // log("更新seqId error", e.stack, seqIdKey);
        }
        // log("更新消息", existMsg.msgSeq, existMsg.msgShortId, existMsg.msgId);
    }


    private async genMsgShortId(): Promise<number> {
        const key = "msg_current_short_id";
        if (this.currentShortId === undefined) {
            try {
                let id: string = await this.db.get(key);
                this.currentShortId = parseInt(id);
            } catch (e) {
                this.currentShortId = -2147483640
            }
        }

        this.currentShortId++;
        await this.db.put(key, this.currentShortId.toString());
        return this.currentShortId;
    }

    async addFileCache(fileName: string, data: FileCache) {
        const key = this.DB_KEY_PREFIX_FILE + fileName;
        if (this.cache[key]) {
            return
        }
        let cacheDBData = {...data}
        delete cacheDBData['downloadFunc']
        this.cache[fileName] = data;
        await this.db.put(key, JSON.stringify(cacheDBData));
    }

    async getFileCache(fileName: string): Promise<FileCache | undefined> {
        const key = this.DB_KEY_PREFIX_FILE + fileName;
        if (this.cache[key]) {
            return this.cache[key] as FileCache
        }
        try {

            let data = await this.db.get(key);
            return JSON.parse(data);
        } catch (e) {

        }
    }

    async addGroupNotify(notify: GroupNotify) {
        const key = this.DB_KEY_PREFIX_GROUP_NOTIFY + notify.seq;
        let existNotify = this.cache[key] as GroupNotify
        if (existNotify){
            return
        }
        this.cache[key] = notify;
        this.db.put(key, JSON.stringify(notify)).then();
    }

    async getGroupNotify(seq: string): Promise<GroupNotify | undefined> {
        const key = this.DB_KEY_PREFIX_GROUP_NOTIFY + seq;
        if (this.cache[key]) {
            return this.cache[key] as GroupNotify
        }
        try {
            let data = await this.db.get(key);
            return JSON.parse(data);
        } catch (e) {

        }
    }
}

export const dbUtil = new DBUtil();