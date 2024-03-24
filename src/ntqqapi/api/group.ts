import {ReceiveCmdS} from "../hook";
import {Group, GroupMember, GroupMemberRole, GroupNotifies, GroupNotify, GroupRequestOperateTypes} from "../types";
import {callNTQQApi, GeneralCallResult, NTQQApiClass, NTQQApiMethod} from "../ntcall";
import {uidMaps} from "../../common/data";
import {dbUtil} from "../../common/db";
import {log} from "../../common/utils/log";
import {NTQQWindowApi, NTQQWindows} from "./window";

export class NTQQGroupApi{
    static async getGroups(forced = false) {
        let cbCmd = ReceiveCmdS.GROUPS
        if (process.platform != "win32") {
            cbCmd = ReceiveCmdS.GROUPS_STORE
        }
        const result = await callNTQQApi<{
            updateType: number,
            groupList: Group[]
        }>({methodName: NTQQApiMethod.GROUPS, args: [{force_update: forced}, undefined], cbCmd})
        return result.groupList
    }
    static async getGroupMembers(groupQQ: string, num = 3000): Promise<GroupMember[]> {
        const sceneId = await callNTQQApi({
            methodName: NTQQApiMethod.GROUP_MEMBER_SCENE,
            args: [{
                groupCode: groupQQ,
                scene: "groupMemberList_MainWindow"
            }]
        })
        // log("get group member sceneId", sceneId);
        try {
            const result = await callNTQQApi<{
                result: { infos: any }
            }>({
                methodName: NTQQApiMethod.GROUP_MEMBERS,
                args: [{
                    sceneId: sceneId,
                    num: num
                },
                    null
                ]
            })
            // log("members info", typeof result.result.infos, Object.keys(result.result.infos))
            const values = result.result.infos.values()

            const members: GroupMember[] = Array.from(values)
            for (const member of members) {
                uidMaps[member.uid] = member.uin;
            }
            // log(uidMaps);
            // log("members info", values);
            log(`get group ${groupQQ} members success`)
            return members
        } catch (e) {
            log(`get group ${groupQQ} members failed`, e)
            return []
        }
    }
    static async getGroupNotifies() {
        // 获取管理员变更
        // 加群通知，退出通知，需要管理员权限
        callNTQQApi<GeneralCallResult>({
            methodName: ReceiveCmdS.GROUP_NOTIFY,
            classNameIsRegister: true,
        }).then()
        return await callNTQQApi<GroupNotifies>({
            methodName: NTQQApiMethod.GET_GROUP_NOTICE,
            cbCmd: ReceiveCmdS.GROUP_NOTIFY,
            afterFirstCmd: false,
            args: [
                {"doubt": false, "startSeq": "", "number": 14},
                null
            ]
        });
    }
    static async getGroupIgnoreNotifies() {
        await NTQQGroupApi.getGroupNotifies();
        return await NTQQWindowApi.openWindow(NTQQWindows.GroupNotifyFilterWindow,[], ReceiveCmdS.GROUP_NOTIFY);
    }
    static async handleGroupRequest(seq: string, operateType: GroupRequestOperateTypes, reason?: string) {
        const notify: GroupNotify = await dbUtil.getGroupNotify(seq)
        if (!notify) {
            throw `${seq}对应的加群通知不存在`
        }
        // delete groupNotifies[seq];
        return await callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.HANDLE_GROUP_REQUEST,
            args: [
                {
                    "doubt": false,
                    "operateMsg": {
                        "operateType": operateType, // 2 拒绝
                        "targetMsg": {
                            "seq": seq,  // 通知序列号
                            "type": notify.type,
                            "groupCode": notify.group.groupCode,
                            "postscript": reason
                        }
                    }
                },
                null
            ]
        });
    }
    static async quitGroup(groupQQ: string) {
        await callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.QUIT_GROUP,
            args: [
                {"groupCode": groupQQ},
                null
            ]
        })
    }
    static async kickMember(groupQQ: string, kickUids: string[], refuseForever: boolean = false, kickReason: string = '') {
        return await callNTQQApi<GeneralCallResult>(
            {
                methodName: NTQQApiMethod.KICK_MEMBER,
                args: [
                    {
                        groupCode: groupQQ,
                        kickUids,
                        refuseForever,
                        kickReason,
                    }
                ]
            }
        )
    }
    static async banMember(groupQQ: string, memList: Array<{ uid: string, timeStamp: number }>) {
        // timeStamp为秒数, 0为解除禁言
        return await callNTQQApi<GeneralCallResult>(
            {
                methodName: NTQQApiMethod.MUTE_MEMBER,
                args: [
                    {
                        groupCode: groupQQ,
                        memList,
                    }
                ]
            }
        )
    }
    static async banGroup(groupQQ: string, shutUp: boolean) {
        return await callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.MUTE_GROUP,
            args: [
                {
                    groupCode: groupQQ,
                    shutUp
                }, null
            ]
        })
    }
    static async setMemberCard(groupQQ: string, memberUid: string, cardName: string) {
        return await callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.SET_MEMBER_CARD,
            args: [
                {
                    groupCode: groupQQ,
                    uid: memberUid,
                    cardName
                }, null
            ]
        })
    }
    static async setMemberRole(groupQQ: string, memberUid: string, role: GroupMemberRole) {
        return await callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.SET_MEMBER_ROLE,
            args: [
                {
                    groupCode: groupQQ,
                    uid: memberUid,
                    role
                }, null
            ]
        })
    }
    static async setGroupName(groupQQ: string, groupName: string) {
        return await callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.SET_GROUP_NAME,
            args: [
                {
                    groupCode: groupQQ,
                    groupName
                }, null
            ]
        })
    }

    // 头衔不可用
    static async setGroupTitle(groupQQ: string, uid: string, title: string) {
        return await callNTQQApi<GeneralCallResult>({
            methodName: NTQQApiMethod.SET_GROUP_TITLE,
            args: [
                {
                    groupCode: groupQQ,
                    uid,
                    title
                }, null
            ]
        })
    }
    static publishGroupBulletin(groupQQ: string, title: string, content: string) {

    }
}