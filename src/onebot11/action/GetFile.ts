import BaseAction from "./BaseAction";
import {fileCache} from "../../common/data";
import {getConfigUtil} from "../../common/utils";
import fs from "fs/promises";

export interface GetFilePayload{
    file: string // 文件名
}

export interface GetFileResponse{
    file?: string  // path
    url?: string
    file_size?: string
    file_name?: string
    base64?: string
}


export class GetFileBase extends BaseAction<GetFilePayload, GetFileResponse>{
    protected async _handle(payload: GetFilePayload): Promise<GetFileResponse> {
        const cache = fileCache.get(payload.file)
        const {autoDeleteFile, enableLocalFile2Url, autoDeleteFileSecond} = getConfigUtil().getConfig()
        if (!cache) {
            throw new Error('file not found')
        }
        if (cache.downloadFunc) {
            await cache.downloadFunc()
        }
        let res : GetFileResponse=  {
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
        if (autoDeleteFile) {
            setTimeout(() => {
                fs.unlink(cache.filePath)
            }, autoDeleteFileSecond * 1000)
        }
        return res
    }
}