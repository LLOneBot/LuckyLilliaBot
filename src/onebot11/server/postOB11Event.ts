import {getConfigUtil, log} from "../../common/utils";
import {OB11Message} from "../types";
import {selfInfo} from "../../common/data";
import {OB11BaseMetaEvent} from "../event/meta/OB11BaseMetaEvent";
import {OB11BaseNoticeEvent} from "../event/notice/OB11BaseNoticeEvent";
import { WebSocket as WebSocketClass } from "ws";
import {wsReply} from "./ws/reply";

export type PostEventType = OB11Message | OB11BaseMetaEvent | OB11BaseNoticeEvent

const eventWSList: WebSocketClass[] = [];

export function registerWsEventSender(ws: WebSocketClass) {
    eventWSList.push(ws);
}

export function unregisterWsEventSender(ws: WebSocketClass) {
    let index = eventWSList.indexOf(ws);
    if (index !== -1) {
        eventWSList.splice(index, 1);
    }
}

export function postWsEvent(event: PostEventType) {
    for (const ws of eventWSList) {
        new Promise(() => {
            wsReply(ws, event);
        }).then()
    }
}

export function postOB11Event(msg: PostEventType, reportSelf=false) {
    const config = getConfigUtil().getConfig();
    // 判断msg是否是event
    if (!config.reportSelfMessage && !reportSelf) {
        if ((msg as OB11Message).user_id.toString() == selfInfo.uin) {
            return
        }
    }
    if (config.ob11.enableHttpPost) {
        for (const host of config.ob11.httpHosts) {
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
    }
    postWsEvent(msg);
}