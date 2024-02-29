import {OB11GroupNoticeEvent} from "./OB11GroupNoticeEvent";

export class OB11GroupDecreaseEvent extends OB11GroupNoticeEvent {
    notice_type = "group_decrease";
    sub_type: "leave" | "kick" | "kick_me" = "leave";  // TODO: 实现其他几种子类型的识别 ("leave" | "kick" | "kick_me")
    operate_id: number;

    constructor(groupId: number, userId: number) {
        super();
        this.group_id = groupId;
        this.operate_id = userId;  // 实际上不应该这么实现，但是现在还没有办法识别用户是被踢出的，还是自己主动退出的
        this.user_id = userId;
    }
}
