import { getConfigUtil, log } from "../common/utils";

const express = require("express");
const expressWs = require("express-ws");

import * as http from "http";
import * as websocket from "ws";
import urlParse from "url";
import express from "express";
import { Request } from 'express';
import { Response } from 'express';
import { getConfigUtil, log } from "../common/utils";
import { heartInterval, selfInfo } from "../common/data";
import { OB11Message, OB11Return, OB11MessageData } from './types';
import {actionHandlers, actionMap} from "./actions";
import {OB11Response, OB11WebsocketResponse} from "./actions/utils";
import {registerEventSender, unregisterEventSender} from "./event/manager";
import ReconnectingWebsocket from "./ReconnectingWebsocket";
import { actionHandlers } from "./actions";
import { OB11Response } from "./actions/utils";
import { ActionName } from "./actions/types";
import BaseAction from "./actions/BaseAction";
import { OB11Constructor } from "./constructor";
import { OB11EventBase, OB11LifeCycleEvent, OB11MetaEvent, OB11NoticeEvent } from "./events/types";

let accessToken = ""

// @SiberianHusky 2021-08-15
enum WebsocketType {
    API,
    EVENT,
    ALL
}

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
let httpServer: http.Server = null;
expressAPP.use(express.urlencoded({extended: true, limit: "500mb"}));

const expressWsApp = express();
const websocketClientConnections = [];

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

export function startWebsocketServer(port: number) {
    const config = getConfigUtil().getConfig();
    if (config.enableWs) {
        try {
            expressWs(expressWsApp)
            expressWsApp.listen(getConfigUtil().getConfig().wsPort, function () {
                console.log(`llonebot websocket service started 0.0.0.0:${port}`);
            });
        }
        catch (e) {
            console.log(e);
        }
    }
}

export function initWebsocket() {
    if (getConfigUtil().getConfig().enableWs) {
        expressWsApp.ws("/api", (ws, req) => {
            initWebsocketServer(ws, req, WebsocketType.API);
        });
        expressWsApp.ws("/event", (ws, req) => {
            initWebsocketServer(ws, req, WebsocketType.EVENT);
        });
        expressWsApp.ws("/", (ws, req) => {
            initWebsocketServer(ws, req, WebsocketType.ALL);
        });
    }

    initReverseWebsocket();
}

function initReverseWebsocket() {
    const config = getConfigUtil().getConfig();
    if (config.enableWsReverse) {
        for (const url of config.wsHosts) {
            try {
                let wsClient = new ReconnectingWebsocket(url);
                websocketClientConnections.push(wsClient);
                registerEventSender(wsClient);

                wsClient.onclose = function () {
                    console.log("The websocket connection: " + url + " closed, trying reconnecting...");
                    unregisterEventSender(wsClient);
                    let index = websocketClientConnections.indexOf(wsClient);
                    if (index !== -1) {
                        websocketClientConnections.splice(index, 1);
                    }
                }

                wsClient.onmessage = async function (message) {
                    console.log(message);
                    if (typeof message === "string") {
                        try {
                            let recv = JSON.parse(message);
                            let echo = recv.echo ?? "";

                            if (actionMap.has(recv.action)) {
                                let action = actionMap.get(recv.action);
                                const result = await action.websocketHandle(recv.params, echo);
                                wsClient.send(JSON.stringify(result));
                            }
                            else {
                                wsClient.send(JSON.stringify(OB11WebsocketResponse.error("Bad Request", 1400, echo)));
                            }
                        } catch (e) {
                            log(e.stack);
                            wsClient.send(JSON.stringify(OB11WebsocketResponse.error(e.stack.toString(), 1200)));
                        }
                    }
                }
            }
            catch (e) {
                console.log(e);
            }
        }
    }
}

function initWebsocketServer(ws, req, type: WebsocketType) {
    if (type == WebsocketType.EVENT || type == WebsocketType.ALL) {
        registerEventSender(ws);
    }

    ws.on("message", async function (message) {
        if (type == WebsocketType.API || type == WebsocketType.ALL) {
            try {
                let recv = JSON.parse(message);
                let echo = recv.echo ?? "";

                if (actionMap.has(recv.action)) {
                    let action = actionMap.get(recv.action)
                    const result = await action.websocketHandle(recv.params, echo);
                    ws.send(JSON.stringify(result));
                }
                else {
                    ws.send(JSON.stringify(OB11WebsocketResponse.error("Bad Request", 1400, echo)));
                }
            } catch (e) {
                log(e.stack);
                ws.send(JSON.stringify(OB11WebsocketResponse.error(e.stack.toString(), 1200)));
            }
        }
    });

    ws.on("close", function (ev) {
        if (type == WebsocketType.EVENT || type == WebsocketType.ALL) {
            unregisterEventSender(ws);
        }
    });
}

let wsEventClients: websocket.WebSocket[] = [];
type RouterHandler = (payload: any) => Promise<OB11Return<any>>
let routers: Record<string, RouterHandler> = {};

function wsReply(wsClient: websocket.WebSocket, data: OB11Return<any> | PostMsgType) {
    try {
        wsClient.send(JSON.stringify(data))
        log("ws 消息上报", data)
    } catch (e) {
        log("websocket 回复失败", e)
    }
}


// TODO: 统一一下逻辑
export function startWSServer(port: number) {
    if (wsServer) {
        wsServer.close((err) => {
            log("ws server close failed!", err)
        })
    }
    wsServer = new websocket.Server({port})
    wsServer.on("connection", (ws, req) => {
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
                ws.send(JSON.stringify(OB11Response.res(null, 1403, "token验证失败")))
                return ws.close()
            }
        }
        if (url == "/api" || url == "/api/" || url == "/") {
            ws.on("message", async (msg) => {

                let receiveData: { action: ActionName, params: any, echo?: string } = {action: null, params: {}}
                let echo = ""
                log("收到ws消息", msg.toString())
                try {
                    receiveData = JSON.parse(msg.toString())
                    echo = receiveData.echo
                } catch (e) {
                    return wsReply(ws, {...OB11Response.error("json解析失败，请检查数据格式"), echo})
                }
                const handle: RouterHandler | undefined = routers[receiveData.action]
                if (!handle) {
                    let handleResult = OB11Response.error("不支持的api " + receiveData.action, 1404)
                    handleResult.echo = echo
                    return wsReply(ws, handleResult)
                }
                try {
                    let handleResult = await handle(receiveData.params)
                    if (echo){
                        handleResult.echo = echo
                    }
                    wsReply(ws, handleResult)
                } catch (e) {
                    wsReply(ws, OB11Response.error(`api处理出错:${e}`))
                }
            })
        }
        if (url == "/event" || url == "/event/" || url == "/") {
            log("event上报ws客户端已连接")
            wsEventClients.push(ws)
            try {
                wsReply(ws, OB11Constructor.lifeCycleEvent())
            }catch (e){
                log("发送生命周期失败", e)
            }
            // 心跳
            let wsHeart = setInterval(()=>{
                if (wsEventClients.find(c => c == ws)){
                    wsReply(ws, OB11Constructor.heartEvent())
                }
            }, heartInterval)
            ws.on("close", () => {
                clearInterval(wsHeart);
                log("event上报ws客户端已断开")
                wsEventClients = wsEventClients.filter((c) => c != ws)
            })
        }
    })
}

type PostMsgType = OB11Message | OB11MetaEvent | OB11NoticeEvent

export function postMsg(msg: PostMsgType) {
    const {reportSelfMessage} = getConfigUtil().getConfig()
    // 判断msg是否是event
    if (!reportSelfMessage) {
        if ((msg as OB11Message).user_id.toString() == selfInfo.uin) {
            return
        }
    }
    for (const host of getConfigUtil().getConfig().hosts) {
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
    for (const wsClient of wsEventClients) {
        log("新消息事件ws上报", msg)
        new Promise((resolve, reject) => {
            wsReply(wsClient, msg);
        }).then();
    }
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
    routers[action] = handle
}

for (const action of actionHandlers) {
    registerRouter(action.actionName, (payload) => action.handle(payload))
}