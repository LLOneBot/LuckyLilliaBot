import {selfInfo} from "../data";
import fs from "fs";
import path from "node:path";
import {DATA_DIR, truncateString} from "./index";
import {getConfigUtil} from "../config";

const date = new Date();
const logFileName = `llonebot-${date.toLocaleString("zh-CN")}.log`.replace(/\//g, "-").replace(/:/g, "-");
const logDir = path.join(DATA_DIR, "logs");
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, {recursive: true});
}

export function log(...msg: any[]) {
    if (!getConfigUtil().getConfig().log) {
        return //console.log(...msg);
    }

    const userInfo = selfInfo.uin ? `${selfInfo.nick}(${selfInfo.uin})` : ""
    let logMsg = "";
    for (let msgItem of msg) {
        // 判断是否是对象
        if (typeof msgItem === "object") {
            let obj = JSON.parse(JSON.stringify(msgItem));
            logMsg += JSON.stringify(truncateString(obj)) + " ";
            continue;
        }
        logMsg += msgItem + " ";
    }
    let currentDateTime = new Date().toLocaleString();
    logMsg = `${currentDateTime} ${userInfo}: ${logMsg}\n\n`
    // sendLog(...msg);
    // console.log(msg)
    fs.appendFile(path.join(logDir, logFileName), logMsg, (err: any) => {

    })
}