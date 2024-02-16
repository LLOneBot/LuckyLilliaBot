import * as path from "path";
import {selfInfo} from "./data";
import {ConfigUtil} from "./config";
import util from "util";
import { sendLog } from '../main/ipcsend';

const fs = require('fs');

export const CONFIG_DIR = global.LiteLoader.plugins["LLOneBot"].path.data;

export function getConfigUtil() {
    const configFilePath = path.join(CONFIG_DIR, `config_${selfInfo.uin}.json`)
    return new ConfigUtil(configFilePath)
}

export function log(...msg: any[]) {
    if (!getConfigUtil().getConfig().log){
        return
    }
    let currentDateTime = new Date().toLocaleString();
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const currentDate = `${year}-${month}-${day}`;
    const userInfo = selfInfo.uin ? `${selfInfo.nick}(${selfInfo.uin})` : ""
    let logMsg = "";
    for (let msgItem of msg){
        // 判断是否是对象
        if (typeof msgItem === "object"){
            logMsg += JSON.stringify(msgItem) + " ";
            continue;
        }
        logMsg += msgItem + " ";
    }
    logMsg = `${currentDateTime} ${userInfo}: ${logMsg}\n\n`
    // sendLog(...msg);
    // console.log(msg)
    fs.appendFile(path.join(CONFIG_DIR , `llonebot-${currentDate}.log`), logMsg, (err: any) => {

    })
}

export function isGIF(path: string) {
    const buffer = Buffer.alloc(4);
    const fd = fs.openSync(path, 'r');
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    return buffer.toString() === 'GIF8'
}


// 定义一个异步函数来检查文件是否存在
export function checkFileReceived(path: string, timeout: number=3000): Promise<void> {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        function check() {
            if (fs.existsSync(path)) {
                resolve();
            } else if (Date.now() - startTime > timeout) {
                reject(new Error(`文件不存在: ${path}`));
            } else {
                setTimeout(check, 100);
            }
        }

        check();
    });
}

export async function file2base64(path: string){
    const readFile = util.promisify(fs.readFile);
    let result = {
        err: "",
        data: ""
    }
    try {
        // 读取文件内容
        // if (!fs.existsSync(path)){
        //     path = path.replace("\\Ori\\", "\\Thumb\\");
        // }
        try {
            await checkFileReceived(path, 5000);
        } catch (e: any) {
            result.err = e.toString();
            return result;
        }
        const data = await readFile(path);
        // 转换为Base64编码
        result.data = data.toString('base64');
    } catch (err) {
        result.err = err.toString();
    }
    return result;
}
