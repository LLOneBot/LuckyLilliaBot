// import {DATA_DIR} from "./utils";
import {Level} from "level";
import {RawMessage} from "../ntqqapi/types";
import {DATA_DIR, log} from "./utils";
import {selfInfo} from "./data";


class DBUtil {
    private readonly DB_KEY_PREFIX_MSG_ID = "msg_id_";
    private readonly DB_KEY_PREFIX_MSG_SHORT_ID = "msg_short_id_";
    private readonly DB_KEY_PREFIX_MSG_SEQ_ID = "msg_seq_id_";
    private db: Level;
    private cache: Record<string, RawMessage> = {}  // <msg_id_ | msg_short_id_ | msg_seq_id_><id>: RawMessage

    /*
    * 数据库结构
    * msg_id_101231230999: {} // 长id: RawMessage
    * msg_short_id_1: 101231230999  // 短id: 长id
    * msg_seq_id_1: 101231230999  // 序列id: 长id
    * */

    constructor() {
        let initCount = 0;
        new Promise((resolve, reject) => {
            const initDB = () => {
                initCount++;
                if (initCount > 50) {
                    return reject("init db fail")
                }

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
                    // console.log("init db fail", e.stack.toString())
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
        this.cache[longIdKey] = this.cache[shortIdKey] = this.cache[seqIdKey] = msg
    }

    async getMsgByShortId(shortMsgId: number): Promise<RawMessage> {
        const shortMsgIdKey = this.DB_KEY_PREFIX_MSG_SHORT_ID + shortMsgId;
        if (this.cache[shortMsgIdKey]) {
            return this.cache[shortMsgIdKey]
        }
        const longId = await this.db.get(shortMsgIdKey);
        const msg = await this.getMsgByLongId(longId)
        this.addCache(msg)
        return msg
    }

    async getMsgByLongId(longId: string): Promise<RawMessage> {
        const longIdKey = this.DB_KEY_PREFIX_MSG_ID + longId;
        if (this.cache[longIdKey]) {
            return this.cache[longIdKey]
        }
        const data = await this.db.get(longIdKey)
        const msg = JSON.parse(data)
        this.addCache(msg)
        return msg
    }

    async getMsgBySeqId(seqId: string): Promise<RawMessage> {
        const seqIdKey = this.DB_KEY_PREFIX_MSG_SEQ_ID + seqId;
        if (this.cache[seqIdKey]) {
            return this.cache[seqIdKey]
        }
        const longId = await this.db.get(seqIdKey);
        const msg = await this.getMsgByLongId(longId)
        this.addCache(msg)
        return msg
    }

    async addMsg(msg: RawMessage) {
        // 有则更新，无则添加
        const longIdKey = this.DB_KEY_PREFIX_MSG_ID + msg.msgId
        let existMsg = this.cache[longIdKey]
        if (!existMsg) {
            try {
                existMsg = await this.getMsgByLongId(msg.msgId)
            } catch (e) {

            }
        }
        if (existMsg) {
            this.updateMsg(msg).then()
            return existMsg.msgShortId
        }

        const shortMsgId = await this.genMsgShortId();
        const shortIdKey = this.DB_KEY_PREFIX_MSG_SHORT_ID + shortMsgId;
        const seqIdKey = this.DB_KEY_PREFIX_MSG_SEQ_ID + msg.msgSeq;
        msg.msgShortId = shortMsgId;
        try {
            await this.db.put(shortIdKey, msg.msgId);
            await this.db.put(longIdKey, JSON.stringify(msg));
            await this.db.put(seqIdKey, msg.msgId);

        } catch (e) {
            log("addMsg db error", e.stack.toString());
        }
        this.cache[seqIdKey] = this.cache[shortIdKey] = this.cache[longIdKey] = msg;
        return shortMsgId
    }

    async updateMsg(msg: RawMessage) {
        const longIdKey = this.DB_KEY_PREFIX_MSG_ID + msg.msgId
        let existMsg = this.cache[longIdKey]
        if (!existMsg) {
            try {
                existMsg = await this.getMsgByLongId(msg.msgId)
            } catch (e) {
                return
            }
        }

        Object.assign(existMsg, msg)
        await this.db.put(longIdKey, JSON.stringify(existMsg));
    }

    private async genMsgShortId(): Promise<number> {
        let shortId = -2147483640
        const key = "msg_current_short_id";
        try {
            let id: string = await this.db.get(key);
            shortId = parseInt(id);
        } catch (e) {
        }
        shortId++;
        await this.db.put(key, shortId.toString());
        return shortId;
    }
}

export const dbUtil = new DBUtil();