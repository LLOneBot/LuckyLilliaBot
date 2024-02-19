import {OB11GroupNoticeEvent} from "./OB11GroupNoticeEvent";

export class OB11GroupIncreaseEvent extends OB11GroupNoticeEvent {
    notice_type = "group_increase";
    sub_type = "approve";  // TODO: 实现其他几种子类型的识别 ("approve" | "invite")
    operate_id: number;

    constructor(groupId: number, userId: number) {
        super();
        this.group_id = groupId;
        this.operate_id = userId;  // 实际上不应该这么实现，但是现在还没有办法识别用户是被邀请的，还是主动加入的
        this.user_id = userId;
    }
}