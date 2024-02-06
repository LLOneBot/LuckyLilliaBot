// 运行在 Electron 主进程 下的插件入口

import * as path from "path";
import {BrowserWindow, ipcMain} from 'electron';
import * as util from 'util';

import {Config, Group, RawMessage, SelfInfo, User} from "../common/types";
import {
    CHANNEL_DOWNLOAD_FILE,
    CHANNEL_GET_CONFIG,
    CHANNEL_SET_SELF_INFO,
    CHANNEL_LOG,
    CHANNEL_POST_ONEBOT_DATA,
    CHANNEL_SET_CONFIG,
    CHANNEL_START_HTTP_SERVER,
    CHANNEL_UPDATE_FRIENDS,
    CHANNEL_UPDATE_GROUPS, CHANNEL_DELETE_FILE, CHANNEL_GET_RUNNING_STATUS, CHANNEL_FILE2BASE64, CHANNEL_GET_HISTORY_MSG
} from "../common/channels";
import {ConfigUtil} from "../common/config";
import {postMsg, startExpress} from "../server/httpserver";
import {checkFileReceived, CONFIG_DIR, file2base64, getConfigUtil, isGIF, log} from "../common/utils";
import {friends, groups, msgHistory, selfInfo} from "../common/data";
import {} from "../global";
import {hookNTQQApiReceive, ReceiveCmd, registerReceiveHook} from "../ntqqapi/hook";
import {OB11Construct} from "../onebot11/construct";

const fs = require('fs');

let running = false;


// 加载插件时触发
function onLoad() {
    log("llonebot main onLoad");

    // const config_dir = browserWindow.LiteLoader.plugins["LLOneBot"].path.data;


    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, {recursive: true});
    }
    ipcMain.handle(CHANNEL_GET_CONFIG, (event: any, arg: any) => {
        return getConfigUtil().getConfig()
    })
    ipcMain.handle(CHANNEL_DOWNLOAD_FILE, async (event: any, arg: { uri: string, fileName: string }): Promise<{
        success: boolean,
        errMsg: string,
        path: string
    }> => {
        let filePath = path.join(CONFIG_DIR, arg.fileName)
        let url = new URL(arg.uri);
        if (url.protocol == "base64:") {
            // base64转成文件
            let base64Data = arg.uri.split("base64://")[1]
            try {
                const buffer = Buffer.from(base64Data, 'base64');
                fs.writeFileSync(filePath, buffer);
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
                fs.writeFileSync(filePath, Buffer.from(buffer));
            } catch (e: any) {
                return {
                    success: false,
                    errMsg: `${url}下载失败,` + e.toString(),
                    path: ""
                }
            }
        }
        else{
            return {
                success: false,
                errMsg: `不支持的file协议,` + url.protocol,
                path: ""
            }
        }
        if (isGIF(filePath)) {
            fs.renameSync(filePath, filePath + ".gif");
            filePath += ".gif";
        }
        return {
            success: true,
            errMsg: "",
            path: filePath
        };
    })
    ipcMain.on(CHANNEL_SET_CONFIG, (event: any, arg: Config) => {
        getConfigUtil().setConfig(arg)
    })

    ipcMain.on(CHANNEL_START_HTTP_SERVER, (event: any, arg: any) => {
        startExpress(getConfigUtil().getConfig().port)
    })

    ipcMain.on(CHANNEL_UPDATE_GROUPS, (event: any, arg: Group[]) => {
        for (const group of arg) {
            let existGroup = groups.find(g => g.uid == group.uid)
            if (existGroup) {
                if (!existGroup.members) {
                    existGroup.members = []
                }
                existGroup.name = group.name
                for (const member of group.members || []) {
                    let existMember = existGroup.members?.find(m => m.uin == member.uin)
                    if (existMember) {
                        existMember.nick = member.nick
                        existMember.cardName = member.cardName
                    } else {
                        existGroup.members?.push(member)
                    }
                }
            } else {
                groups.push(group)
            }
        }
        groups.length = 0
        groups.push(...arg)
    })

    ipcMain.on(CHANNEL_UPDATE_FRIENDS, (event: any, arg: User[]) => {
        friends.length = 0
        friends.push(...arg)
    })

    ipcMain.on(CHANNEL_POST_ONEBOT_DATA, (event: any, arg: any) => {
        postMsg(arg);
    })

    ipcMain.on(CHANNEL_LOG, (event: any, arg: any) => {
        log(arg)
    })

    ipcMain.handle(CHANNEL_SET_SELF_INFO, (event: any, arg: SelfInfo) => {
        selfInfo.user_id = arg.user_id;
        selfInfo.nickname = arg.nickname;
        running = true;
    })

    ipcMain.on(CHANNEL_DELETE_FILE, (event: any, arg: string[]) => {
        for (const path of arg) {
            fs.unlinkSync(path);
        }
    })

    ipcMain.handle(CHANNEL_GET_RUNNING_STATUS, (event: any, arg: any) => {
        return running;
    })

    ipcMain.handle(CHANNEL_FILE2BASE64, async (event: any, path: string): Promise<{err: string, data: string}> => {
        return await file2base64(path);
    })

    ipcMain.handle(CHANNEL_GET_HISTORY_MSG, (event: any, arg: string): RawMessage | undefined => {
        return msgHistory[arg] || null;
    })

    function postRawMsg(msgList:RawMessage[]) {
        const {debug, reportSelfMessage} = getConfigUtil().getConfig();
        for (const message of msgList) {
            OB11Construct.constructMessage(message).then((msg) => {
                if (debug) {
                    msg.raw = message;
                }
                if (msg.user_id == selfInfo.user_id && !reportSelfMessage) {
                    return
                }
                postMsg(msg);
            }).catch(e=>log("constructMessage error: ", e.toString()));
        }
    }

    registerReceiveHook<{ msgList: Array<RawMessage> }>(ReceiveCmd.NEW_MSG, (payload) => {
        try {
            postRawMsg(payload.msgList);
        } catch (e) {
            log("report message error: ", e.toString())
        }
    })

    registerReceiveHook<{ msgRecord: RawMessage }>(ReceiveCmd.SELF_SEND_MSG, (payload) => {
        const {reportSelfMessage} = getConfigUtil().getConfig()
        if (!reportSelfMessage) {
            return
        }
        log("reportSelfMessage", payload)
        try {
            postRawMsg([payload.msgRecord]);
        } catch (e) {
            log("report self message error: ", e.toString())
        }
    })
}


// 创建窗口时触发
function onBrowserWindowCreated(window: BrowserWindow) {
    try {
        hookNTQQApiReceive(window);
    } catch (e){
        log("llonebot hook error: ", e.toString())
    }
}

try {
    onLoad();
} catch (e: any) {
    console.log(e.toString())
}

// 这两个函数都是可选的
export {
    onBrowserWindowCreated
}