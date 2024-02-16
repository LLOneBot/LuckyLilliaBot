import BaseEvent from "./BaseEvent";
import {EventType} from "./manager";

class BaseMessageEvent extends BaseEvent {
    post_type = EventType.MESSAGE;
}

export default BaseMessageEvent