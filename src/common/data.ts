import {NTQQApi} from '../ntqqapi/ntcall'
import {
    type Friend,
    type FriendRequest,
    type Group,
    type GroupMember,
    type GroupNotify,
    type RawMessage,
    type SelfInfo
} from '../ntqqapi/types'
import {type FileCache, type LLOneBotError} from './types'
import {dbUtil} from "./db";
import {raw} from "express";
import {log} from "./utils";

export const selfInfo: SelfInfo = {
    uid: '',
    uin: '',
    nick: '',
    online: true
}
export let groups: Group[] = []
export let friends: Friend[] = []
export let friendRequests: Map<number, FriendRequest> = new Map<number, FriendRequest>()
export const llonebotError: LLOneBotError = {
    ffmpegError: '',
    otherError: ''
}


export async function getFriend(qq: string, uid: string = ""): Promise<Friend | undefined> {
    let filterKey = uid ? "uid" : "uin"
    let filterValue = uid ? uid : qq
    let friend = friends.find(friend => friend[filterKey] === filterValue.toString())
    // if (!friend) {
    //     try {
    //         friends = (await NTQQApi.getFriends(true))
    //         friend = friends.find(friend => friend[filterKey] === filterValue.toString())
    //     } catch (e) {
    //         // log("刷新好友列表失败", e.stack.toString())
    //     }
    // }
    return friend
}

export async function getGroup(qq: string): Promise<Group | undefined> {
    let group = groups.find(group => group.groupCode === qq.toString())
    if (!group) {
        try {
            const _groups = await NTQQApi.getGroups(true);
            group = _groups.find(group => group.groupCode === qq.toString())
            if (group) {
                groups.push(group)
            }
        } catch (e) {
        }

    }
    return group
}

export async function getGroupMember(groupQQ: string | number, memberQQ: string | number, memberUid: string = null) {
    groupQQ = groupQQ.toString()
    if (memberQQ) {
        memberQQ = memberQQ.toString()
    }
    const group = await getGroup(groupQQ)
    if (group) {
        const filterKey = memberQQ ? "uin" : "uid"
        const filterValue = memberQQ ? memberQQ : memberUid
        let filterFunc: (member: GroupMember) => boolean = member => member[filterKey] === filterValue
        let member = group.members?.find(filterFunc)
        if (!member) {
            try {
                const _members = await NTQQApi.getGroupMembers(groupQQ)
                if (_members.length > 0) {
                    group.members = _members
                }
            } catch (e) {
                // log("刷新群成员列表失败", e.stack.toString())
            }

            member = group.members?.find(filterFunc)
        }
        return member
    }
    return null
}

export async function refreshGroupMembers(groupQQ: string) {
    const group = groups.find(group => group.groupCode === groupQQ)
    if (group) {
        group.members = await NTQQApi.getGroupMembers(groupQQ)
    }
}

export const uidMaps: Record<string, string> = {} // 一串加密的字符串(uid) -> qq号

export function getUidByUin(uin: string) {
    for (const key in uidMaps) {
        if (uidMaps[key] === uin) {
            return key
        }
    }
}

export let tempGroupCodeMap: Record<string, string> = {}  // peerUid => 群号