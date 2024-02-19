import {OB11BaseNoticeEvent} from "./OB11BaseNoticeEvent";

export class OB11GroupAdminNoticeEvent extends OB11BaseNoticeEvent {
    notice_type = "group_admin"
    sub_type: string  // "set" | "unset"
}