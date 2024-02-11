import { NTQQApi } from '../ntqqapi/ntcall';
import { Friend, Group, RawMessage, SelfInfo } from "../ntqqapi/types";

export let groups: Group[] = []
export let friends: Friend[] = []
export let msgHistory: Record<string, RawMessage> = {}  // msgId: RawMessage

export async function getFriend(qq: string): Promise<Friend | undefined> {
    let friend = friends.find(friend => friend.uin === qq)
    // if (!friend){
    //     friends = (await NTQQApi.getFriends(true))
    //     friend = friends.find(friend => friend.uin === qq)
    // }
    return friend
}

export async function getGroup(qq: string): Promise<Group | undefined> {
    let group = groups.find(group => group.groupCode === qq)
    // if (!group){
    //     groups = await NTQQApi.getGroups(true);
    //     group = groups.find(group => group.groupCode === qq)
    // }
    return group
}

export async function getGroupMember(groupQQ: string, memberQQ: string) {
    const group = await getGroup(groupQQ)
    if (group) {
        let member = group.members?.find(member => member.uin === memberQQ)
        if (!member){
            const _members = await NTQQApi.getGroupMembers(groupQQ)
            if (_members.length){
                group.members = _members
            }
            member = group.members?.find(member => member.uin === memberQQ)
        }
        return member
    }
}

export let selfInfo: SelfInfo = {
    uid: "",
    uin: "",
    nick: "",
}


export function getHistoryMsgBySeq(seq: string) {
    return Object.values(msgHistory).find(msg => msg.msgSeq === seq)
}


export let uidMaps:Record<string, Friend> = {}  // 一串加密的字符串(uid) -> qq号

export function getStrangerByUin(uin: string) {
    for (const key in uidMaps) {
        if (uidMaps[key].uin === uin) {
            return uidMaps[key];
        }
    }
}