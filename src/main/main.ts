// 运行在 Electron 主进程 下的插件入口

import * as path from "path";
import { BrowserWindow, ipcMain } from 'electron';
import * as util from 'util';

import { Config } from "../common/types";
import {
    CHANNEL_GET_CONFIG,
    CHANNEL_LOG,
    CHANNEL_SET_CONFIG,
} from "../common/channels";
import { postMsg, startHTTPServer, startWSServer } from "../onebot11/server";
import { CONFIG_DIR, getConfigUtil, log } from "../common/utils";
import { addHistoryMsg, msgHistory, selfInfo } from "../common/data";
import { hookNTQQApiReceive, ReceiveCmd, registerReceiveHook } from "../ntqqapi/hook";
import { OB11Constructor } from "../onebot11/constructor";
import { NTQQApi } from "../ntqqapi/ntcall";
import { Group, RawMessage, SelfInfo } from "../ntqqapi/types";

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
    ipcMain.on(CHANNEL_SET_CONFIG, (event: any, arg: Config) => {
        let oldConfig = getConfigUtil().getConfig();
        getConfigUtil().setConfig(arg)
        if (arg.port != oldConfig.port){
            startHTTPServer(arg.port)
        }
        if (arg.wsPort != oldConfig.wsPort){
            startWSServer(arg.wsPort)
        }
    })

    ipcMain.on(CHANNEL_LOG, (event: any, arg: any) => {
        log(arg)
    })


    function postRawMsg(msgList: RawMessage[]) {
        const {debug, reportSelfMessage} = getConfigUtil().getConfig();
        for (let message of msgList) {
            message.msgShortId = msgHistory[message.msgId]?.msgShortId
            if (!message.msgShortId) {
                addHistoryMsg(message)
            }
            OB11Constructor.message(message).then((msg) => {
                if (debug) {
                    msg.raw = message;
                }
                if (msg.user_id == selfInfo.uin && !reportSelfMessage) {
                    return
                }
                postMsg(msg);
                // log("post msg", msg)
            }).catch(e => log("constructMessage error: ", e.toString()));
        }
    }


    function start() {
        registerReceiveHook<{ msgList: Array<RawMessage> }>(ReceiveCmd.NEW_MSG, (payload) => {
            try {
                // log("received msg length", payload.msgList.length);
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
            // log("reportSelfMessage", payload)
            try {
                postRawMsg([payload.msgRecord]);
            } catch (e) {
                log("report self message error: ", e.toString())
            }
        })
        NTQQApi.getGroups(true).then()
        const config = getConfigUtil().getConfig()
        startHTTPServer(config.port)
        startWSServer(config.wsPort)
        log("LLOneBot start")
    }

    const init = async () => {
        try {
            const _ = await NTQQApi.getSelfInfo()
            Object.assign(selfInfo, _)
            selfInfo.nick = selfInfo.uin
            log("get self simple info", _)
        } catch (e) {
            log("retry get self info")
        }
        if (selfInfo.uin) {
            try {
                const userInfo = (await NTQQApi.getUserInfo(selfInfo.uid))
                log("self info", userInfo);
                if (userInfo) {
                    selfInfo.nick = userInfo.nick
                } else {
                    return setTimeout(init, 1000)
                }
            } catch (e) {
                log("get self nickname failed", e.toString())
                return setTimeout(init, 1000)
            }
            start();
        }
        else{
            setTimeout(init, 1000)
        }
    }
    setTimeout(init, 1000)
}


// 创建窗口时触发
function onBrowserWindowCreated(window: BrowserWindow) {
    try {
        hookNTQQApiReceive(window);
    } catch (e) {
        log("LLOneBot hook error: ", e.toString())
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