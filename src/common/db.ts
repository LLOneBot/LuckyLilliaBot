// import {DATA_DIR} from "./utils";
import {Level} from "level";
import {RawMessage} from "../ntqqapi/types";
import {DATA_DIR, log} from "./utils";
import {selfInfo} from "./data";
import * as wasi from "wasi";


class DBUtil {
    private readonly DB_KEY_PREFIX_MSG_ID = "msg_id_";
    private readonly DB_KEY_PREFIX_MSG_SHORT_ID = "msg_short_id_";
    private readonly DB_KEY_PREFIX_MSG_SEQ_ID = "msg_seq_id_";
    private db: Level;
    private cache: Record<string, RawMessage> = {}  // <msg_id_ | msg_short_id_ | msg_seq_id_><id>: RawMessage
    private currentShortId: number;

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
        // log("addMsg", msg.msgId, msg.msgSeq, msg.msgShortId);
        const longIdKey = this.DB_KEY_PREFIX_MSG_ID + msg.msgId
        let existMsg = this.cache[longIdKey]
        if (!existMsg) {
            try {
                existMsg = await this.getMsgByLongId(msg.msgId)
            } catch (e) {

            }
        }
        if (existMsg) {
            // log("消息已存在", existMsg.msgSeq, existMsg.msgShortId, existMsg.msgId)
            this.updateMsg(msg).then()
            return existMsg.msgShortId
        }

        const shortMsgId = await this.genMsgShortId();
        const shortIdKey = this.DB_KEY_PREFIX_MSG_SHORT_ID + shortMsgId;
        const seqIdKey = this.DB_KEY_PREFIX_MSG_SEQ_ID + msg.msgSeq;
        msg.msgShortId = shortMsgId;
        try {
            this.db.put(shortIdKey, msg.msgId).then();
            this.db.put(longIdKey, JSON.stringify(msg)).then();
            try {
                if (!(await this.db.get(seqIdKey))) {
                    this.db.put(seqIdKey, msg.msgId).then();
                }
            } catch (e) {

            }
            this.cache[shortIdKey] = this.cache[longIdKey] = msg;
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
        let existMsg = this.cache[longIdKey]
        if (!existMsg) {
            try {
                existMsg = await this.getMsgByLongId(msg.msgId)
            } catch (e) {
                return
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
            if (!(await this.db.get(seqIdKey))) {
                this.db.put(seqIdKey, msg.msgId).then();
            }
        } catch (e) {

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
}

export const dbUtil = new DBUtil();