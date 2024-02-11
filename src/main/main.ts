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
import { ConfigUtil } from "../common/config";
import { postMsg, startExpress } from "../onebot11/server";
import { CONFIG_DIR, getConfigUtil, log } from "../common/utils";
import { friends, groups, msgHistory, selfInfo } from "../common/data";
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
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    ipcMain.handle(CHANNEL_GET_CONFIG, (event: any, arg: any) => {
        return getConfigUtil().getConfig()
    })
    ipcMain.on(CHANNEL_SET_CONFIG, (event: any, arg: Config) => {
        getConfigUtil().setConfig(arg)
    })

    ipcMain.on(CHANNEL_LOG, (event: any, arg: any) => {
        log(arg)
    })


    function postRawMsg(msgList: RawMessage[]) {
        const { debug, reportSelfMessage } = getConfigUtil().getConfig();
        for (const message of msgList) {
            OB11Constructor.message(message).then((msg) => {
                if (debug) {
                    msg.raw = message;
                }
                if (msg.user_id == selfInfo.uin && !reportSelfMessage) {
                    return
                }
                postMsg(msg);
            }).catch(e => log("constructMessage error: ", e.toString()));
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
        const { reportSelfMessage } = getConfigUtil().getConfig()
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

    async function getSelfInfo() {
        try{
            const _ = await NTQQApi.getSelfInfo()
            Object.assign(selfInfo, _)
            selfInfo.nick = selfInfo.uin
            log("get self simple info", _)
        }catch(e){
            log("retry get self info")

        }
        if (selfInfo.uin) {
            try {
                const userInfo = (await NTQQApi.getUserInfo(selfInfo.uid))
                if (userInfo) {
                    selfInfo.nick = userInfo.nick
                }
            }
            catch (e) {
                log("get self nickname failed", e.toString())
            }
            // try {
            //     friends.push(...(await NTQQApi.getFriends(true)))
            //     log("get friends", friends)
            //     let _groups: Group[] = []
            //     for(let i=0; i++; i<3){
            //         try{
            //             _groups = await NTQQApi.getGroups(true)
            //             log("get groups sucess", _groups)
            //             break
            //         } catch(e) {
            //             log("get groups failed", e)
            //         }
            //     }
            //     for (let g of _groups) {
            //         g.members = (await NTQQApi.getGroupMembers(g.groupCode))
            //         log("group members", g.members)
            //         groups.push(g)
            //     }

            // } catch (e) {
            //     log("!!!初始化失败", e.stack.toString())
            // }
            startExpress(getConfigUtil().getConfig().port)
        }
        else{
            setTimeout(() => {
                getSelfInfo().then()
            }, 100)
        }
    }
    getSelfInfo().then()
}


// 创建窗口时触发
function onBrowserWindowCreated(window: BrowserWindow) {
    try {
        hookNTQQApiReceive(window);
    } catch (e) {
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