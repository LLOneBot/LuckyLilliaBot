import BaseAction from "./BaseAction";
import fs from "fs/promises";
import {dbUtil} from "../../common/db";
import {getConfigUtil} from "../../common/config";
import {log, sleep, uri2local} from "../../common/utils";
import {NTQQFileApi} from "../../ntqqapi/api/file";
import {ActionName} from "./types";

export interface GetFilePayload {
    file: string // 文件名或者fileUuid
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
            if (cache.url){
                const downloadResult = await uri2local(cache.url)
                if (downloadResult.success) {
                    cache.filePath = downloadResult.path
                    dbUtil.addFileCache(payload.file, cache).then()
                } else {
                    throw new Error("file download failed. " + downloadResult.errMsg)
                }
            }
            else{
                // 没有url的可能是私聊文件或者群文件，需要自己下载
                log("需要调用 NTQQ 下载文件api")
                if (cache.msgId) {
                    let msg = await dbUtil.getMsgByLongId(cache.msgId)
                    if (msg){
                        log("找到了文件 msg", msg)
                        const element = msg.elements.find(e=>e.fileElement)
                        log("找到了文件 element", element);
                        // 构建下载函数
                        await NTQQFileApi.downloadMedia(msg.msgId, msg.chatType, msg.peerUid,
                            element.elementId, "", "", true)
                        await sleep(1000);
                        msg = await dbUtil.getMsgByLongId(cache.msgId)
                        log("下载完成后的msg", msg)
                        cache.filePath = msg?.elements.find(e=>e.fileElement)?.fileElement?.filePath
                        dbUtil.addFileCache(payload.file, cache).then()
                    }

                }
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
                try{
                    res.base64 = await fs.readFile(cache.filePath, 'base64')
                }catch (e) {
                    throw new Error("文件下载失败. " + e)
                }
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

export default class GetFile extends GetFileBase {
    actionName = ActionName.GetFile

    protected async _handle(payload: {file_id: string, file: string}): Promise<GetFileResponse> {
        if (!payload.file_id) {
            throw new Error('file_id 不能为空')
        }
        payload.file = payload.file_id
        return super._handle(payload);
    }
}