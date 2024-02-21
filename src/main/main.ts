// 运行在 Electron 主进程 下的插件入口

import {BrowserWindow, ipcMain} from 'electron';
import fs from 'fs';
import {Config} from "../common/types";
import {CHANNEL_GET_CONFIG, CHANNEL_LOG, CHANNEL_SET_CONFIG,} from "../common/channels";
import {ob11WebsocketServer} from "../onebot11/server/ws/WebsocketServer";
import {CONFIG_DIR, getConfigUtil, log} from "../common/utils";
import {addHistoryMsg, getGroupMember, msgHistory, selfInfo} from "../common/data";
import {hookNTQQApiCall, hookNTQQApiReceive, ReceiveCmd, registerReceiveHook} from "../ntqqapi/hook";
import {OB11Constructor} from "../onebot11/constructor";
import {NTQQApi} from "../ntqqapi/ntcall";
import {ChatType, RawMessage} from "../ntqqapi/types";
import {ob11HTTPServer} from "../onebot11/server/http";
import {OB11FriendRecallNoticeEvent} from "../onebot11/event/notice/OB11FriendRecallNoticeEvent";
import {OB11GroupRecallNoticeEvent} from "../onebot11/event/notice/OB11GroupRecallNoticeEvent";
import {postEvent} from "../onebot11/server/postevent";
import {ob11ReverseWebsockets} from "../onebot11/server/ws/ReverseWebsocket";
import {EventType} from "../onebot11/event/OB11BaseEvent";


let running = false;


// 加载插件时触发
function onLoad() {
    log("llonebot main onLoad");
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, {recursive: true});
    }
    ipcMain.handle(CHANNEL_GET_CONFIG, (event: any, arg: any) => {
        return getConfigUtil().getConfig()
    })
    ipcMain.on(CHANNEL_SET_CONFIG, (event: any, arg: Config) => {
        let oldConfig = getConfigUtil().getConfig();
        getConfigUtil().setConfig(arg)
        if (arg.ob11.httpPort != oldConfig.ob11.httpPort && arg.ob11.enableHttp) {
            ob11HTTPServer.restart(arg.ob11.httpPort);
        }
        // 判断是否启用或关闭HTTP服务
        if (!arg.ob11.enableHttp) {
            ob11HTTPServer.stop();
        } else {
            ob11HTTPServer.start(arg.ob11.httpPort);
        }
        // 正向ws端口变化，重启服务
        if (arg.ob11.wsPort != oldConfig.ob11.wsPort) {
            ob11WebsocketServer.restart(arg.ob11.wsPort);
        }
        // 判断是否启用或关闭正向ws
        if (arg.ob11.enableWs != oldConfig.ob11.enableWs) {
            if (arg.ob11.enableWs) {
                ob11WebsocketServer.start(arg.ob11.wsPort);
            } else {
                ob11WebsocketServer.stop();
            }
        }
        // 判断是否启用或关闭反向ws
        if (arg.ob11.enableWsReverse != oldConfig.ob11.enableWsReverse) {
            if (arg.ob11.enableWsReverse) {
                ob11ReverseWebsockets.start();
            } else {
                ob11ReverseWebsockets.stop();
            }
        }
        if (arg.ob11.enableWsReverse) {
            // 判断反向ws地址有变化
            if (arg.ob11.wsHosts.length != oldConfig.ob11.wsHosts.length) {
                ob11ReverseWebsockets.restart();
            } else {
                for (const newHost of arg.ob11.wsHosts) {
                    if (!oldConfig.ob11.wsHosts.includes(newHost)) {
                        ob11ReverseWebsockets.restart();
                        break;
                    }
                }
            }
        }
    })

    ipcMain.on(CHANNEL_LOG, (event: any, arg: any) => {
        log(arg);
    })


    function postReceiveMsg(msgList: RawMessage[]) {
        const {debug, reportSelfMessage} = getConfigUtil().getConfig();
        for (let message of msgList) {
            // log("收到新消息", message)
            message.msgShortId = msgHistory[message.msgId]?.msgShortId
            if (!message.msgShortId) {
                addHistoryMsg(message);
            }
            OB11Constructor.message(message).then((msg) => {
                if (debug) {
                    msg.raw = message;
                }
                const isSelfMsg = msg.user_id.toString() == selfInfo.uin
                if (isSelfMsg && !reportSelfMessage) {
                    return
                }
                postEvent(msg);
                // log("post msg", msg)
            }).catch(e => log("constructMessage error: ", e.toString()));
        }
    }


    async function start() {
        registerReceiveHook<{ msgList: Array<RawMessage> }>(ReceiveCmd.NEW_MSG, (payload) => {
            try {
                postReceiveMsg(payload.msgList);
            } catch (e) {
                log("report message error: ", e.toString());
            }
        })
        registerReceiveHook<{ msgList: Array<RawMessage> }>(ReceiveCmd.UPDATE_MSG, async (payload) => {
            for (const message of payload.msgList) {
                // log("message update", message.sendStatus, message)
                if (message.recallTime != "0") {
                    // 撤回消息上报
                    const oriMessage = msgHistory[message.msgId]
                    if (!oriMessage) {
                        continue
                    }
                    if (message.chatType == ChatType.friend) {
                        const friendRecallEvent = new OB11FriendRecallNoticeEvent(parseInt(message.senderUin), oriMessage.msgShortId);
                        postEvent(friendRecallEvent);
                    } else if (message.chatType == ChatType.group) {
                        let operatorId = message.senderUin
                        for (const element of message.elements) {
                            const operatorUid = element.grayTipElement?.revokeElement.operatorUid
                            const operator = await getGroupMember(message.peerUin, null, operatorUid)
                            operatorId = operator.uin
                        }
                        const groupRecallEvent = new OB11GroupRecallNoticeEvent(
                            parseInt(message.peerUin),
                            parseInt(message.senderUin),
                            parseInt(operatorId),
                            oriMessage.msgShortId
                        )

                        postEvent(groupRecallEvent);
                    }
                    continue
                }
                addHistoryMsg(message)
            }
        })
        registerReceiveHook<{ msgRecord: RawMessage }>(ReceiveCmd.SELF_SEND_MSG, (payload) => {
            const {reportSelfMessage} = getConfigUtil().getConfig();
            if (!reportSelfMessage) {
                return
            }
            // log("reportSelfMessage", payload)
            try {
                postReceiveMsg([payload.msgRecord]);
            } catch (e) {
                log("report self message error: ", e.toString());
            }
        })
        NTQQApi.getGroups(true).then()
        const config = getConfigUtil().getConfig()
        if (config.ob11.enableHttp) {
            try {
                ob11HTTPServer.start(config.ob11.httpPort)
            } catch (e) {
                log("http server start failed", e);
            }
        }
        if (config.ob11.enableWs){
            ob11WebsocketServer.start(config.ob11.wsPort);
        }
        if (config.ob11.enableWsReverse){
            ob11ReverseWebsockets.start();
        }

        log("LLOneBot start")
    }

    const init = async () => {
        try {
            const _ = await NTQQApi.getSelfInfo();
            Object.assign(selfInfo, _);
            selfInfo.nick = selfInfo.uin;
            log("get self simple info", _);
        } catch (e) {
            log("retry get self info");
        }
        if (selfInfo.uin) {
            try {
                const userInfo = (await NTQQApi.getUserInfo(selfInfo.uid));
                log("self info", userInfo);
                if (userInfo) {
                    selfInfo.nick = userInfo.nick;
                } else {
                    return setTimeout(init, 1000);
                }
            } catch (e) {
                log("get self nickname failed", e.toString());
                return setTimeout(init, 1000);
            }
            start().then();
        } else {
            setTimeout(init, 1000)
        }
    }
    setTimeout(init, 1000);
}


// 创建窗口时触发
function onBrowserWindowCreated(window: BrowserWindow) {
    try {
        hookNTQQApiCall(window);
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