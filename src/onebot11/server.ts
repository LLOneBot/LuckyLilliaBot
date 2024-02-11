import { getConfigUtil, log } from "../common/utils";

const express = require("express");
import { Request } from 'express';
import { Response } from 'express';

const JSONbig = require('json-bigint')({ storeAsString: true });
import { selfInfo } from "../common/data";
import { OB11Message, OB11Return, OB11MessageData } from './types';
import { actionHandles } from "./actions";


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


class OB11Response {
    static res<T>(data: T, status: number = 0, message: string = ""): OB11Return<T> {
        return {
            status: status,
            retcode: status,
            data: data,
            message: message
        }
    }
    static ok<T>(data: T) {
        return OB11Response.res<T>(data)
    }
    static error(err: string) {
        return OB11Response.res(null, -1, err)
    }
}

const expressAPP = express();
expressAPP.use(express.urlencoded({ extended: true, limit: "500mb" }));

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
// expressAPP.use(express.json({
//     limit: '500mb',
//     verify: (req: any, res: any, buf: any, encoding: any) => {
//         req.rawBody = buf;
//     }
// }));

export function startExpress(port: number) {

    expressAPP.get('/', (req: Request, res: Response) => {
        res.send('llonebot已启动');
    })

    expressAPP.listen(port, "0.0.0.0", () => {
        console.log(`llonebot started 0.0.0.0:${port}`);
    });
}


export function postMsg(msg: OB11Message) {
    const { reportSelfMessage } = getConfigUtil().getConfig()
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
            log(`新消息事件上报成功: ${host} ` + JSON.stringify(msg));
        }, (err: any) => {
            log(`新消息事件上报失败: ${host} ` + err + JSON.stringify(msg));
        });
    }
}

let routers: Record<string, (payload: any) => Promise<OB11Return<any>>> = {};

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
        }
        catch (e) {
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
    routers[url] = handle
}

for (const [action, handler] of Object.entries(actionHandles)) {
    registerRouter(action, (payload) => handler.handle(payload))
}
