import * as http from "http";
import * as websocket from "ws";
import express from "express";
import { Request } from 'express';
import { Response } from 'express';
import { getConfigUtil, log } from "../common/utils";
import { selfInfo } from "../common/data";
import { OB11Message, OB11Return, OB11MessageData } from './types';
import { actionHandlers } from "./actions";
import { OB11Response } from "./actions/utils";
import { ActionName } from "./actions/types";
import BaseAction from "./actions/BaseAction";

let wsServer: websocket.Server = null;

const JSONbig = require('json-bigint')({storeAsString: true});
const expressAPP = express();
let httpServer: http.Server = null;
expressAPP.use(express.urlencoded({extended: true, limit: "500mb"}));

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


export function startHTTPServer(port: number) {
    if (httpServer) {
        httpServer.close();
    }
    expressAPP.get('/', (req: Request, res: Response) => {
        res.send('LLOneBot已启动');
    })

    httpServer = expressAPP.listen(port, "0.0.0.0", () => {
        console.log(`LLOneBot http server started 0.0.0.0:${port}`);
    });
}

let wsEventClients: websocket.WebSocket[] = [];
type RouterHandler = (payload: any) => Promise<OB11Return<any>>
let routers: Record<string, RouterHandler> = {};

function wsReply(wsClient: websocket.WebSocket, data: OB11Return<any> | OB11Message) {
    try {
        wsClient.send(JSON.stringify(data))
    } catch (e) {
        log("websocket 回复失败", e)
    }
}

export function startWSServer(port: number) {
    if (wsServer) {
        wsServer.close((err)=>{
            log("ws server close failed!", err)
        })
    }
    wsServer = new websocket.Server({port})
    wsServer.on("connection", (ws, req) => {
        const url = req.url;
        ws.send('Welcome to the LLOneBot WebSocket server! url:' + url);

        if (url == "/api" || url == "/api/" || url == "/") {
            ws.on("message", async (msg) => {

                let receiveData: { action: ActionName, params: any } = {action: null, params: {}}
                log("收到ws消息", msg.toString())
                try {
                    receiveData = JSON.parse(msg.toString())
                } catch (e) {
                    return wsReply(ws, OB11Response.error("json解析失败，请检查数据格式"))
                }
                const handle: RouterHandler | undefined = routers[receiveData.action]
                if (!handle) {
                    return wsReply(ws, OB11Response.error("不支持的api " + receiveData.action))
                }
                try {
                    const handleResult = await handle(receiveData.params)
                    wsReply(ws, handleResult)
                } catch (e) {
                    wsReply(ws, OB11Response.error(`api处理出错:${e}`))
                }
            })
        }
        if (url == "/event" || url == "/event/" || url == "/") {
            log("event上报ws客户端已连接")
            wsEventClients.push(ws)
            ws.on("close", () => {
                log("event上报ws客户端已断开")
                wsEventClients = wsEventClients.filter((c) => c != ws)
            })
        }
    })
}


export function postMsg(msg: OB11Message) {
    const {reportSelfMessage} = getConfigUtil().getConfig()
    if (!reportSelfMessage) {
        if (msg.user_id == selfInfo.uin) {
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
            res.send(OB11Response.error(e.stack.toString()))
        }
    }

    expressAPP.post(url, (req: Request, res: Response) => {
        _handle(res, req.body).then()
    });
    expressAPP.get(url, (req: Request, res: Response) => {
        _handle(res, req.query as any).then()
    });
    routers[action] = handle
}

for (const action of actionHandlers) {
    registerRouter(action.actionName, (payload) => action.handle(payload))
}