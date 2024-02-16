import BaseEvent from "./BaseEvent";
import {EventType} from "./manager";

class GroupIncreaseEvent extends BaseEvent {
    post_type = EventType.NOTICE;
    notice_type = "group_increase";
    subtype = "approve";  // TODO: 实现其他几种子类型的识别
    group_id: number;
    operate_id: number;
    user_id: number;

    constructor(groupId: number, userId: number) {
        super();
        this.group_id = groupId;
        this.operate_id = userId;  // 实际上不应该这么实现，但是现在还没有办法识别用户是被邀请的，还是主动加入的
        this.user_id = userId;
    }
}


export default GroupIncreaseEvent