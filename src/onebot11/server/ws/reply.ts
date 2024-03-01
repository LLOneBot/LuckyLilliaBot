import { WebSocket as WebSocketClass } from "ws";
import {OB11Response} from "../../action/utils";
import {PostEventType} from "../postOB11Event";
import {isNull, log} from "../../../common/utils";

export function wsReply(wsClient: WebSocketClass, data: OB11Response | PostEventType) {
    try {
        let packet = Object.assign({
        }, data);
        if (isNull(packet["echo"])){
            delete packet["echo"];
        }
        wsClient.send(JSON.stringify(packet))
        log("ws 消息上报", wsClient.url || "", data)
    } catch (e) {
        log("websocket 回复失败", e)
    }
}