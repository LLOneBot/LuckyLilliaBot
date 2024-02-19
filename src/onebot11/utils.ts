import {CONFIG_DIR, isGIF} from "../common/utils";
import * as path from 'path';
import {OB11MessageData} from "./types";

const fs = require("fs").promises;

export async function uri2local(fileName: string, uri: string){
    let filePath = path.join(CONFIG_DIR, fileName)
    let url = new URL(uri);
    let res = {
        success: false,
        errMsg: "",
        path: "",
        isLocal: false
    }
    if (url.protocol == "base64:") {
        // base64转成文件
        let base64Data = uri.split("base64://")[1]
        try {
            const buffer = Buffer.from(base64Data, 'base64');
            await fs.writeFile(filePath, buffer);
        } catch (e: any) {
            res.errMsg = `base64文件下载失败,` + e.toString()
            return res
        }
    } else if (url.protocol == "http:" || url.protocol == "https:") {
        // 下载文件
        let fetchRes = await fetch(url)
        if (!fetchRes.ok) {
            res.errMsg = `${url}下载失败,` + fetchRes.statusText
            return res
        }
        let blob = await fetchRes.blob();
        let buffer = await blob.arrayBuffer();
        try {
            await fs.writeFile(filePath, Buffer.from(buffer));
        } catch (e: any) {
            res.errMsg = `${url}下载失败,` + e.toString()
            return res
        }
    } else if (url.protocol === "file:"){
        // await fs.copyFile(url.pathname, filePath);
        let pathname = decodeURIComponent(url.pathname)
        if (process.platform === "win32"){
            filePath = pathname.slice(1)
        }
        else{
            filePath = pathname
        }
        res.isLocal = true
    }
    else{
        res.errMsg = `不支持的file协议,` + url.protocol
        return res
    }
    if (isGIF(filePath) && !res.isLocal) {
        await fs.rename(filePath, filePath + ".gif");
        filePath += ".gif";
    }
    res.success = true
    res.path = filePath
    return res
}


function checkSendMessage(sendMsgList: OB11MessageData[]) {
    function checkUri(uri: string): boolean {
        const pattern = /^(file:\/\/|http:\/\/|https:\/\/|base64:\/\/)/;
        return pattern.test(uri);
    }

    for (let msg of sendMsgList) {
        if (msg["type"] && msg["data"]) {
            let type = msg["type"];
            let data = msg["data"];
            if (type === "text" && !data["text"]) {
                return 400;
            } else if (["image", "voice", "record"].includes(type)) {
                if (!data["file"]) {
                    return 400;
                } else {
                    if (checkUri(data["file"])) {
                        return 200;
                    } else {
                        return 400;
                    }
                }

            } else if (type === "at" && !data["qq"]) {
                return 400;
            } else if (type === "reply" && !data["id"]) {
                return 400;
            }
        } else {
            return 400
        }
    }
    return 200;
}
