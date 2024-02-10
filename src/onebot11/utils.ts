import { CONFIG_DIR, isGIF } from "../common/utils";
import * as path from 'path';
import { NTQQApi } from '../ntqqapi/ntcall';
const fs = require("fs").promises;

export async function uri2local(fileName: string, uri: string){
    let filePath = path.join(CONFIG_DIR, fileName)
    let url = new URL(uri);
    if (url.protocol == "base64:") {
        // base64转成文件
        let base64Data = uri.split("base64://")[1]
        try {
            const buffer = Buffer.from(base64Data, 'base64');
            await fs.writeFile(filePath, buffer);
        } catch (e: any) {
            return {
                success: false,
                errMsg: `base64文件下载失败,` + e.toString(),
                path: ""
            }
        }
    } else if (url.protocol == "http:" || url.protocol == "https:") {
        // 下载文件
        let res = await fetch(url)
        if (!res.ok) {
            return {
                success: false,
                errMsg: `${url}下载失败,` + res.statusText,
                path: ""
            }
        }
        let blob = await res.blob();
        let buffer = await blob.arrayBuffer();
        try {
            await fs.writeFile(filePath, Buffer.from(buffer));
        } catch (e: any) {
            return {
                success: false,
                errMsg: `${url}下载失败,` + e.toString(),
                path: ""
            }
        }
    } else if (url.protocol === "file:"){
        await fs.copyFile(url.pathname, filePath);
        // filePath = (await NTQQApi.uploadFile(url.pathname)).path;
    }
    else{
        return {
            success: false,
            errMsg: `不支持的file协议,` + url.protocol,
            path: ""
        }
    }
    if (isGIF(filePath)) {
        await fs.rename(filePath, filePath + ".gif");
        filePath += ".gif";
    }
    return {
        success: true,
        errMsg: "",
        path: filePath
    };
}