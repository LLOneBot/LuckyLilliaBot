import {selfInfo} from "../../common/data";

export enum EventType {
    META = "meta_event",
    REQUEST = "request",
    NOTICE = "notice",
    MESSAGE = "message",
    MESSAGE_SENT = "message_sent",
}


export abstract class OB11BaseEvent {
    time = Date.now();
    self_id = parseInt(selfInfo.uin);
    post_type: EventType;
}