import {CONFIG_DIR, isGIF} from "../common/utils";
import {v4 as uuidv4} from "uuid";
import * as path from 'path';

const fs = require("fs").promises;

export async function uri2local(uri: string, fileName: string=null){
    if (!fileName){
        fileName = uuidv4();
    }
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
            fileName = path.basename(url.pathname) || fileName
            filePath = path.join(CONFIG_DIR, fileName)
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