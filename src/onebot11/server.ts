import * as http from "http";
import * as websocket from "ws";
import urlParse from "url";
import express, {Request, Response} from "express";
import {getConfigUtil, log} from "../common/utils";
import {heartInterval, selfInfo} from "../common/data";
import {OB11Message, OB11MessageData, OB11Return} from './types';
import {actionHandlers, actionMap} from "./actions";
import {OB11Response, OB11WebsocketResponse} from "./actions/utils";
import {callEvent, registerEventSender, unregisterEventSender} from "./event/manager";
import {ReconnectingWebsocket} from "./ReconnectingWebsocket";
import {ActionName} from "./actions/types";
import {OB11BaseMetaEvent} from "./event/meta/OB11BaseMetaEvent";
import {OB11BaseNoticeEvent} from "./event/notice/OB11BaseNoticeEvent";
import BaseAction from "./actions/BaseAction";
import {LifeCycleSubType, OB11LifeCycleEvent} from "./event/meta/OB11LifeCycleEvent";
import {OB11HeartbeatEvent} from "./event/meta/OB11HeartbeatEvent";

let accessToken = "";
let heartbeatRunning = false;

// @SiberianHusky 2021-08-15

function checkSendMessage(sendMsgList: OB11MessageData[]) {
    function checkUri(uri: string): boolean {
        const pattern = /^(file:\/\/|http:\/\/|https:\/\/|base64:\/\/)/;
        return pattern.test(uri);
    }

    for (let msg of sendMsgList) {
        if (msg["type"] && msg["data"]) {
            let type = msg["type"];
            let data = msg["data"];
            if (type === "text" && !data["text"]) {
                return 400;
            } else if (["image", "voice", "record"].includes(type)) {
                if (!data["file"]) {
                    return 400;
                } else {
                    if (checkUri(data["file"])) {
                        return 200;
                    } else {
                        return 400;
                    }
                }

            } else if (type === "at" && !data["qq"]) {
                return 400;
            } else if (type === "reply" && !data["id"]) {
                return 400;
            }
        } else {
            return 400
        }
    }
    return 200;
}

// ==end==

const JSONbig = require('json-bigint')({storeAsString: true});

const expressAPP = express();
expressAPP.use(express.urlencoded({extended: true, limit: "500mb"}));

let httpServer: http.Server = null;

let websocketServer = null;

expressAPP.use((req, res, next) => {
    let data = '';
    req.on('data', chunk => {
        data += chunk.toString();
    });
    req.on('end', () => {
        if (data) {
            try {
                // log("receive raw", data)
                req.body = JSONbig.parse(data);
            } catch (e) {
                return next(e);
            }
        }
        next();
    });
});

const expressAuthorize = (req: Request, res: Response, next: () => void) => {
    let token = ""
    const authHeader = req.get("authorization")
    if (authHeader) {
        token = authHeader.split("Bearer ").pop()
        log("receive http header token", token)
    } else if (req.query.access_token) {
        if (Array.isArray(req.query.access_token)) {
            token = req.query.access_token[0].toString();
        } else {
            token = req.query.access_token.toString();
        }
        log("receive http url token", token)
    }

    if (accessToken) {
        if (token != accessToken) {
            return res.status(403).send(JSON.stringify({message: 'token verify failed!'}));
        }
    }
    next();

};

export function setToken(token: string) {
    accessToken = token
}

export function startHTTPServer(port: number) {
    if (httpServer) {
        httpServer.close();
    }
    expressAPP.get('/', (req: Request, res: Response) => {
        res.send('LLOneBot已启动');
    })

    if (getConfigUtil().getConfig().enableHttp) {
        httpServer = expressAPP.listen(port, "0.0.0.0", () => {
            console.log(`llonebot http service started 0.0.0.0:${port}`);
        });
    }
}

export function initWebsocket(port: number) {
    if (!heartbeatRunning) {
        setInterval(() => {
            callEvent(new OB11HeartbeatEvent(true, true, heartInterval));
        }, heartInterval);  // 心跳包

        heartbeatRunning = true;
    }

    if (getConfigUtil().getConfig().enableWs) {
        if (websocketServer) {
            websocketServer.close((err) => {
                log("ws server close failed!", err)
            })
        }

        websocketServer = new websocket.Server({port});
        console.log(`llonebot websocket service started 0.0.0.0:${port}`);

        websocketServer.on("connection", (ws, req) => {
            const url = req.url.split("?").shift();
            log("receive ws connect", url)
            let token: string = ""
            const authHeader = req.headers['authorization'];
            if (authHeader) {
                token = authHeader.split("Bearer ").pop()
                log("receive ws header token", token);
            } else {
                const parsedUrl = urlParse.parse(req.url, true);
                const urlToken = parsedUrl.query.access_token;
                if (urlToken) {
                    if (Array.isArray(urlToken)) {
                        token = urlToken[0]
                    } else {
                        token = urlToken
                    }
                    log("receive ws url token", token);
                }
            }
            if (accessToken) {
                if (token != accessToken) {
                    ws.send(JSON.stringify(OB11WebsocketResponse.res(null, "failed", 1403, "token验证失败")))
                    return ws.close()
                }
            }

            if (url == "/api" || url == "/api/" || url == "/") {
                ws.on("message", async (msg) => {
                    let receiveData: { action: ActionName, params: any, echo?: string } = {action: null, params: {}}
                    let echo = ""
                    log("收到正向Websocket消息", msg.toString())
                    try {
                        receiveData = JSON.parse(msg.toString())
                        echo = receiveData.echo
                    } catch (e) {
                        return wsReply(ws, OB11WebsocketResponse.error("json解析失败，请检查数据格式", 1400, echo))
                    }
                    const action: BaseAction<any, any> = actionMap.get(receiveData.action);
                    if (!action) {
                        return wsReply(ws, OB11WebsocketResponse.error("不支持的api " + receiveData.action, 1404, echo))
                    }
                    try {
                        let handleResult = await action.websocketHandle(receiveData.params, echo);
                        wsReply(ws, handleResult)
                    } catch (e) {
                        wsReply(ws, OB11WebsocketResponse.error(`api处理出错:${e}`, 1200, echo))
                    }
                })
            }
            if (url == "/event" || url == "/event/" || url == "/") {
                registerEventSender(ws);

                log("event上报ws客户端已连接")

                try {
                    wsReply(ws, new OB11LifeCycleEvent(LifeCycleSubType.CONNECT))
                } catch (e){
                    log("发送生命周期失败", e)
                }

                ws.on("close", () => {
                    log("event上报ws客户端已断开")
                    unregisterEventSender(ws);
                })
            }
        })
    }

    initReverseWebsocket();
}
function initReverseWebsocket() {
    const config = getConfigUtil().getConfig();
    if (config.enableWsReverse) {
        console.log("Prepare to connect all reverse websockets...");
        for (const url of config.wsHosts) {
            new Promise(() => {
                try {
                    let wsClient = new ReconnectingWebsocket(url);
                    registerEventSender(wsClient);

                    wsClient.onopen = function () {
                        wsReply(wsClient, new OB11LifeCycleEvent(LifeCycleSubType.CONNECT));
                    }

                    wsClient.onclose = function () {
                        unregisterEventSender(wsClient);
                    }

                    wsClient.onmessage = async function (msg) {
                        let receiveData: { action: ActionName, params: any, echo?: string } = {action: null, params: {}}
                        let echo = ""
                        log("收到正向Websocket消息", msg.toString())
                        try {
                            receiveData = JSON.parse(msg.toString())
                            echo = receiveData.echo
                        } catch (e) {
                            return wsReply(wsClient, OB11WebsocketResponse.error("json解析失败，请检查数据格式", 1400, echo))
                        }
                        const action: BaseAction<any, any> = actionMap.get(receiveData.action);
                        if (!action) {
                            return wsReply(wsClient, OB11WebsocketResponse.error("不支持的api " + receiveData.action, 1404, echo))
                        }
                        try {
                            let handleResult = await action.websocketHandle(receiveData.params, echo);
                            wsReply(wsClient, handleResult)
                        } catch (e) {
                            wsReply(wsClient, OB11WebsocketResponse.error(`api处理出错:${e}`, 1200, echo))
                        }
                    }
                }
                catch (e) {
                    log(e.stack);
                }
            }).then();
        }
    }
}

export function wsReply(wsClient: websocket.WebSocket | ReconnectingWebsocket, data: OB11Return<any> | PostMsgType) {
    try {
        wsClient.send(JSON.stringify(data))
        log("ws 消息上报", data)
    } catch (e) {
        log("websocket 回复失败", e)
    }
}

export type PostMsgType = OB11Message | OB11BaseMetaEvent | OB11BaseNoticeEvent

export function postMsg(msg: PostMsgType) {
    const config = getConfigUtil().getConfig();
    // 判断msg是否是event
    if (!config.reportSelfMessage) {
        if ((msg as OB11Message).user_id.toString() == selfInfo.uin) {
            return
        }
    }
    for (const host of config.httpHosts) {
        fetch(host, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-self-id": selfInfo.uin
            },
            body: JSON.stringify(msg)
        }).then((res: any) => {
            log(`新消息事件HTTP上报成功: ${host} ` + JSON.stringify(msg));
        }, (err: any) => {
            log(`新消息事件HTTP上报失败: ${host} ` + err + JSON.stringify(msg));
        });
    }

    log("新消息事件ws上报", msg);
    callEvent(msg);
}


function registerRouter(action: string, handle: (payload: any) => Promise<any>) {
    let url = action.toString()
    if (!action.startsWith("/")) {
        url = "/" + action
    }

    async function _handle(res: Response, payload: any) {
        log("receive post data", url, payload)
        try {
            const result = await handle(payload)
            res.send(result)
        } catch (e) {
            log(e.stack);
            res.send(OB11Response.error(e.stack.toString(), 200))
        }
    }

    expressAPP.post(url, expressAuthorize, (req: Request, res: Response) => {
        _handle(res, req.body || {}).then()
    });
    expressAPP.get(url, expressAuthorize, (req: Request, res: Response) => {
        _handle(res, req.query as any || {}).then()
    });
}

for (const action of actionHandlers) {
    registerRouter(action.actionName, (payload) => action.handle(payload))
}