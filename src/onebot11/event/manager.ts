import {selfInfo} from "../../common/data";
import BaseEvent from "./BaseEvent";

const websocketList = [];

export enum EventType {
    META = "meta_event",
    REQUEST = "request",
    NOTICE = "notice",
    MESSAGE = "message"
}

export function registerEventSender(ws) {
    websocketList.push(ws);
}

export function unregisterEventSender(ws) {
    let index = websocketList.indexOf(ws);
    if (index !== -1) {
        websocketList.splice(index, 1);
    }
}

export function callEvent<DataType>(event: BaseEvent, data: DataType = null) {

    const assignedEvent = (data == null ? event : Object.assign(event, data));
    for (const ws of websocketList) {
        ws.send(
            JSON.stringify(assignedEvent)
        );
    }
}