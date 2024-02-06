import {Group, MessageElement, RawMessage, SelfInfo, User} from "./types";

export let groups: Group[] = []
export let friends: User[] = []
export let msgHistory: Record<string, RawMessage> = {}  // msgId: RawMessage

export function getFriend(qq: string): User | undefined {
    return friends.find(friend => friend.uin === qq)
}

export function getGroup(qq: string): Group | undefined {
    return groups.find(group => group.uid === qq)
}

export function getGroupMember(groupQQ: string, memberQQ: string) {
    const group = getGroup(groupQQ)
    if (group) {
        return group.members?.find(member => member.uin === memberQQ)
    }
}

export let selfInfo: SelfInfo = {
    user_id: "",
    nickname: ""
}


export function getHistoryMsgBySeq(seq: string) {
    return Object.values(msgHistory).find(msg => msg.msgSeq === seq)
}
