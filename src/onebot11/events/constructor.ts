import {
    OB11EventBase,
    OB11EventPostType, OB11FriendRecallNoticeEvent,
    OB11GroupRecallNoticeEvent,
    OB11HeartEvent,
    OB11LifeCycleEvent, OB11MetaEvent, OB11NoticeEvent
} from "./types";
import { heartInterval, selfInfo } from "../../common/data";

function eventBase(post_type: OB11EventPostType): OB11EventBase {
    return {
        time: Math.floor(Date.now() / 1000),
        self_id: parseInt(selfInfo.uin),
        post_type
    }
}

export class OB11EventConstructor {
    static lifeCycleEvent(): OB11LifeCycleEvent {
        return {
            ...eventBase(OB11EventPostType.META) as OB11MetaEvent,
            meta_event_type: "lifecycle",
            sub_type: "connect"
        }
    }

    static heartEvent(): OB11HeartEvent {
        return {
            ...eventBase(OB11EventPostType.META) as OB11MetaEvent,
            meta_event_type: "heartbeat",
            status: {
                online: true,
                good: true
            },
            interval: heartInterval
        }
    }

    static groupRecallEvent(group_id: string, user_id: string, operator_id: string, message_id: number): OB11GroupRecallNoticeEvent {
        return {
            ...eventBase(OB11EventPostType.NOTICE) as OB11NoticeEvent,
            notice_type: "group_recall",
            group_id: parseInt(group_id),
            user_id: parseInt(user_id),
            operator_id: parseInt(operator_id),
            message_id
        }
    }

    static friendRecallEvent(user_id: string, message_id: number): OB11FriendRecallNoticeEvent {
        return {
            ...eventBase(OB11EventPostType.NOTICE) as OB11NoticeEvent,
            notice_type: "friend_recall",
            user_id: parseInt(user_id),
            message_id
        }
    }
}