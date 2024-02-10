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
import {OB11Constructor} from "../onebot11/constructor";
import {NTQQApi} from "../ntqqapi/ntcall";

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
        getConfigUtil().setConfig(arg)
    })

    ipcMain.on(CHANNEL_LOG, (event: any, arg: any) => {
        log(arg)
    })


    function postRawMsg(msgList:RawMessage[]) {
        const {debug, reportSelfMessage} = getConfigUtil().getConfig();
        for (const message of msgList) {
            OB11Constructor.message(message).then((msg) => {
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
    
    async function getSelfInfo(){
        if (!selfInfo.user_id){
            setTimeout(()=>{
                getSelfInfo().then()
            })
        }
        const _ = await NTQQApi.getSelfInfo()
        if (_.uin){
            log("get self info success", _)
            selfInfo.user_id = _.uin
            let nickName = _.uin
            try{
                const userInfo = (await NTQQApi.getUserInfo(_.uid))
                if (userInfo){
                    nickName = userInfo.nickName
                }
            }
            catch(e){
                log("get self nickname failed", e.toString())
            }
            selfInfo.nickname = nickName
            try{
                // let _friends = await NTQQApi.getFriends(true)
                // log("friends api:", _friends)
                // for (let f of _friends){
                //     friends.push(f)
                // }
                let _groups = await NTQQApi.getGroups(true)
                log("groups api:", _groups)
                for (let g of _groups){
                    g.members = (await NTQQApi.getGroupMembers(g.uid))
                    groups.push(g)
                }

            }catch(e){
                log("!!!初始化失败", e.stack.toString())
            }
            startExpress(getConfigUtil().getConfig().port)
        }
    }
    getSelfInfo().then()
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