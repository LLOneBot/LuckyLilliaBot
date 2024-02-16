import {selfInfo} from "../../common/data";
import {EventType} from "./manager";

class BaseEvent {
    time = new Date().getTime();
    self_id = selfInfo.uin;
    post_type: EventType;
}

export default BaseEvent;