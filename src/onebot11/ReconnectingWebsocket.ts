import {log} from "../common/utils";

const WebSocket = require("ws");

export class ReconnectingWebsocket {
    private websocket;
    private readonly url: string;

    public constructor(url: string) {
        this.url = url;
        this.reconnect()
    }

    public onopen = function (){}

    public onmessage = function (msg){}

    public onclose = function () {}

    public send(msg) {
        if (this.websocket && this.websocket.readyState == WebSocket.OPEN) {
            this.websocket.send(msg);
        }
    }

    private reconnect() {
        this.websocket = new WebSocket(this.url, {
            handshakeTimeout: 2000,
            perMessageDeflate: false
        });

        console.log("Trying to connect to the websocket server: " + this.url);

        const instance = this;

        this.websocket.on("open", function open() {
            console.log("Connected to the websocket server: " + instance.url);
            instance.onopen();
        });

        this.websocket.on("message", function message(data) {
            instance.onmessage(data.toString());
        });

        this.websocket.on("error", console.error);

        this.websocket.on("close", function close() {
            console.log("The websocket connection: " + instance.url + " closed, trying reconnecting...");
            instance.onclose();

            setTimeout(() => {
                instance.reconnect();
            }, 3000);  // TODO: 重连间隔在配置文件中实现
        });
    }
}