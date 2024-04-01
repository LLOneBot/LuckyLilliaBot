import {WebSocket, WebSocketServer} from "ws";
import urlParse from "url";
import {IncomingMessage} from "node:http";
import {log} from "../utils/log";
import {getConfigUtil} from "../config";
import {llonebotError} from "../data";

class WebsocketClientBase {
    private wsClient: WebSocket

    constructor() {
    }

    send(msg: string) {
        if (this.wsClient && this.wsClient.readyState == WebSocket.OPEN) {
            this.wsClient.send(msg);
        }
    }

    onMessage(msg: string) {

    }
}

export class WebsocketServerBase {
    private ws: WebSocketServer = null;

    constructor() {
        console.log(`llonebot websocket service started`)
    }

    start(port: number) {
        try {
            this.ws = new WebSocketServer({port,
                maxPayload: 1024 * 1024 * 1024
            });
            llonebotError.wsServerError = ''
        }catch (e) {
            llonebotError.wsServerError = "正向ws服务启动失败, " + e.toString()
        }
        this.ws.on("connection", (wsClient, req) => {
            const url = req.url.split("?").shift()
            this.authorize(wsClient, req);
            this.onConnect(wsClient, url, req);
            wsClient.on("message", async (msg) => {
                this.onMessage(wsClient, url, msg.toString())
            })
        })
    }

    stop() {
        llonebotError.wsServerError = ''
        this.ws.close((err) => {
            log("ws server close failed!", err)
        });
        this.ws = null;
    }

    restart(port: number) {
        this.stop();
        this.start(port);
    }

    authorize(wsClient: WebSocket, req) {
        let token = getConfigUtil().getConfig().token;
        const url = req.url.split("?").shift();
        log("ws connect", url)
        let clientToken: string = ""
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            clientToken = authHeader.split("Bearer ").pop()
            log("receive ws header token", clientToken);
        } else {
            const parsedUrl = urlParse.parse(req.url, true);
            const urlToken = parsedUrl.query.access_token;
            if (urlToken) {
                if (Array.isArray(urlToken)) {
                    clientToken = urlToken[0]
                } else {
                    clientToken = urlToken
                }
                log("receive ws url token", clientToken);
            }
        }
        if (token && clientToken != token) {
            this.authorizeFailed(wsClient)
            return wsClient.close()
        }
    }

    authorizeFailed(wsClient: WebSocket) {

    }

    onConnect(wsClient: WebSocket, url: string, req: IncomingMessage) {

    }

    onMessage(wsClient: WebSocket, url: string, msg: string) {

    }

    sendHeart() {

    }
}