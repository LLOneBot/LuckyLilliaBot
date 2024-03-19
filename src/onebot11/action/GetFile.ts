import BaseAction from "./BaseAction";
import fs from "fs/promises";
import {dbUtil} from "../../common/db";
import {getConfigUtil} from "../../common/config";
import {log, uri2local} from "../../common/utils";

export interface GetFilePayload {
    file: string // 文件名
}

export interface GetFileResponse {
    file?: string  // path
    url?: string
    file_size?: string
    file_name?: string
    base64?: string
}


export class GetFileBase extends BaseAction<GetFilePayload, GetFileResponse> {
    protected async _handle(payload: GetFilePayload): Promise<GetFileResponse> {
        const cache = await dbUtil.getFileCache(payload.file)
        const {autoDeleteFile, enableLocalFile2Url, autoDeleteFileSecond} = getConfigUtil().getConfig()
        if (!cache) {
            throw new Error('file not found')
        }
        if (cache.downloadFunc) {
            await cache.downloadFunc()
        }
        try {
            await fs.access(cache.filePath, fs.constants.F_OK)
        } catch (e) {
            log("file not found", e)
            const downloadResult = await uri2local(cache.url)
            if (downloadResult.success) {
                cache.filePath = downloadResult.path
                dbUtil.addFileCache(payload.file, cache).then()
            } else {
                throw new Error("file download failed. " + downloadResult.errMsg)
            }
        }
        let res: GetFileResponse = {
            file: cache.filePath,
            url: cache.url,
            file_size: cache.fileSize,
            file_name: cache.fileName
        }
        if (enableLocalFile2Url) {
            if (!cache.url) {
                res.base64 = await fs.readFile(cache.filePath, 'base64')
            }
        }
        // if (autoDeleteFile) {
        //     setTimeout(() => {
        //         fs.unlink(cache.filePath)
        //     }, autoDeleteFileSecond * 1000)
        // }
        return res
    }
}