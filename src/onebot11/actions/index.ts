import { OB11Return } from '../types';
import { OB11Response } from './utils'

import GetMsg from './GetMsg'
import GetLoginInfo from './GetLoginInfo'
import GetFriendList from './GetFriendList'
import GetGroupList from './GetGroupList'
import GetGroupInfo from './GetGroupInfo'
import GetGroupMemberList from './GetGroupMemberList'
import GetGroupMemberInfo from './GetGroupMemberInfo'
import SendGroupMsg from './SendGroupMsg'
import SendPrivateMsg from './SendPrivateMsg'
import SendMsg from './SendMsg'

export const actionHandles = {
    [GetMsg.ACTION_TYPE]: new GetMsg(),
    [GetLoginInfo.ACTION_TYPE]: new GetLoginInfo(),
    [GetFriendList.ACTION_TYPE]: new GetFriendList(),
    [GetGroupList.ACTION_TYPE]: new GetGroupList(),
    [GetGroupInfo.ACTION_TYPE]: new GetGroupInfo(),
    [GetGroupMemberList.ACTION_TYPE]: new GetGroupMemberList(),
    [GetGroupMemberInfo.ACTION_TYPE]: new GetGroupMemberInfo(),
    [SendGroupMsg.ACTION_TYPE]: new SendGroupMsg(),
    [SendPrivateMsg.ACTION_TYPE]: new SendPrivateMsg(),
    [SendMsg.ACTION_TYPE]: new SendMsg(),
}

export async function handleAction(
    jsonData: any,
): Promise<OB11Return<any>> {
    const handler = actionHandles[jsonData.action]
    if (handler) {
        return await handler.handle(jsonData)
    } else {
        return OB11Response.error(`未知的 action: ${jsonData.action}`)
    }
}
