import {DATA_DIR, isGIF, log} from "../common/utils";
import {v4 as uuidv4} from "uuid";
import * as path from 'node:path';
import {fileCache} from "../common/data";
import * as fileType from 'file-type';

const fs = require("fs").promises;

export async function uri2local(uri: string, fileName: string = null) {
    if (!fileName) {
        fileName = uuidv4();
    }
    let filePath = path.join(DATA_DIR, fileName)
    let url = new URL(uri);
    let res = {
        success: false,
        errMsg: "",
        fileName: "",
        ext: "",
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
        let fetchRes: Response;
        try{
            fetchRes = await fetch(url)
        }catch (e) {
            res.errMsg = `${url}下载失败`
            return res
        }
        if (!fetchRes.ok) {
            res.errMsg = `${url}下载失败,` + fetchRes.statusText
            return res
        }
        let blob = await fetchRes.blob();
        let buffer = await blob.arrayBuffer();
        try {
            const pathInfo = path.parse(decodeURIComponent(url.pathname))
            if (pathInfo.name){
                fileName = pathInfo.name
                if (pathInfo.ext){
                    fileName += pathInfo.ext
                    // res.ext = pathInfo.ext
                }
            }
            res.fileName = fileName
            filePath = path.join(DATA_DIR, uuidv4() + fileName)
            await fs.writeFile(filePath, Buffer.from(buffer));
        } catch (e: any) {
            res.errMsg = `${url}下载失败,` + e.toString()
            return res
        }
    } else {
        let pathname: string;
        if (url.protocol === "file:") {
            // await fs.copyFile(url.pathname, filePath);
            pathname = decodeURIComponent(url.pathname)
            if (process.platform === "win32") {
                filePath = pathname.slice(1)
            } else {
                filePath = pathname
            }
        } else {
            const cache = fileCache.get(uri)
            if (cache) {
                filePath = cache.filePath
            } else {
                filePath = uri;
            }
        }

        res.isLocal = true
    }
    // else{
    //     res.errMsg = `不支持的file协议,` + url.protocol
    //     return res
    // }
    // if (isGIF(filePath) && !res.isLocal) {
    //     await fs.rename(filePath, filePath + ".gif");
    //     filePath += ".gif";
    // }
    if (!res.isLocal && !res.ext) {
        try {
            let ext: string = (await fileType.fileTypeFromFile(filePath)).ext
            if (ext) {
                log("获取文件类型", ext, filePath)
                await fs.rename(filePath, filePath + `.${ext}`)
                filePath += `.${ext}`
                res.fileName += `.${ext}`
                res.ext = ext
            }
        } catch (e) {
            // log("获取文件类型失败", filePath,e.stack)
        }
    }
    res.success = true
    res.path = filePath
    return res
}