import BaseEvent from "./BaseEvent";
import {EventType} from "./manager";

class GroupDecreaseEvent extends BaseEvent {
    post_type = EventType.NOTICE;
    notice_type = "group_decrease";
    subtype = "leave";  // TODO: 实现其他几种子类型的识别
    group_id: number;
    operate_id: number;
    user_id: number;

    constructor(groupId: number, userId: number) {
        super();
        this.group_id = groupId;
        this.operate_id = userId;  // 实际上不应该这么实现，但是现在还没有办法识别用户是被踢出的，还是自己主动退出的
        this.user_id = userId;
    }
}

export default GroupDecreaseEvent