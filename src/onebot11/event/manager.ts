import * as websocket from "ws";
import {PostMsgType, wsReply} from "../server";
import {ReconnectingWebsocket} from "../ReconnectingWebsocket";

const websocketList = [];

export function registerEventSender(ws: websocket.WebSocket | ReconnectingWebsocket) {
    websocketList.push(ws);
}

export function unregisterEventSender(ws: websocket.WebSocket | ReconnectingWebsocket) {
    let index = websocketList.indexOf(ws);
    if (index !== -1) {
        websocketList.splice(index, 1);
    }
}

export function callEvent(event: PostMsgType) {
    new Promise(() => {
        for (const ws of websocketList) {
            wsReply(ws, event);
        }
    }).then()
}