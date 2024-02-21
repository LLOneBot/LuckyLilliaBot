import * as websocket from "ws";
import {OB11Response} from "../../action/utils";
import {PostEventType} from "../postevent";
import {log} from "../../../common/utils";

export function wsReply(wsClient: websocket.WebSocket, data: OB11Response | PostEventType) {
    try {
        let packet = Object.assign({
        }, data);
        if (!packet["echo"]){
            delete packet["echo"];
        }
        wsClient.send(JSON.stringify(packet))
        log("ws 消息上报", wsClient.url || "", data)
    } catch (e) {
        log("websocket 回复失败", e)
    }
}