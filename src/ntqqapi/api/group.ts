import { ReceiveCmdS } from '../hook'
import { Group, GroupMember, GroupMemberRole, GroupNotifies, GroupRequestOperateTypes, GroupNotify, GetFileListParam } from '../types'
import { invoke, NTClass, NTMethod } from '../ntcall'
import { GeneralCallResult } from '../services'
import { NTQQWindows } from './window'
import { getSession } from '../wrapper'
import { OnGroupFileInfoUpdateParams } from '../listeners'
import { NodeIKernelGroupService } from '../services'
import { Service, Context } from 'cordis'
import { isNumeric } from '@/common/utils/misc'

declare module 'cordis' {
  interface Context {
    ntGroupApi: NTQQGroupApi
  }
}

export class NTQQGroupApi extends Service {
  static inject = ['ntWindowApi']

  public groupMembers: Map<string, Map<string, GroupMember>> = new Map<string, Map<string, GroupMember>>()

  constructor(protected ctx: Context) {
    super(ctx, 'ntGroupApi', true)
  }

  async getGroups(): Promise<Group[]> {
    const result = await invoke<{
      updateType: number
      groupList: Group[]
    }>(
      'getGroupList',
      [],
      {
        className: NTClass.NODE_STORE_API,
        cbCmd: ReceiveCmdS.GROUPS_STORE,
        afterFirstCmd: false,
      }
    )
    return result.groupList
  }

  async getGroupMembers(groupCode: string, num = 3000): Promise<Map<string, GroupMember>> {
    const session = getSession()
    let result: Awaited<ReturnType<NodeIKernelGroupService['getNextMemberList']>>
    if (session) {
      const groupService = session.getGroupService()
      const sceneId = groupService.createMemberListScene(groupCode, 'groupMemberList_MainWindow')
      result = await groupService.getNextMemberList(sceneId, undefined, num)
    } else {
      const sceneId = await invoke(NTMethod.GROUP_MEMBER_SCENE, [{ groupCode, scene: 'groupMemberList_MainWindow' }])
      result = await invoke(NTMethod.GROUP_MEMBERS, [{ sceneId, num }, null])
    }
    if (result.errCode !== 0) {
      throw ('获取群成员列表出错,' + result.errMsg)
    }
    return result.result.infos
  }

  async getGroupMember(groupCode: string | number, memberUinOrUid: string | number) {
    const groupCodeStr = groupCode.toString()
    const memberUinOrUidStr = memberUinOrUid.toString()
    if (!this.groupMembers.has(groupCodeStr)) {
      try {
        // 更新群成员列表
        this.groupMembers.set(groupCodeStr, await this.getGroupMembers(groupCodeStr))
      }
      catch (e) {
        return null
      }
    }
    let members = this.groupMembers.get(groupCodeStr)!
    const getMember = () => {
      let member: GroupMember | undefined = undefined
      if (isNumeric(memberUinOrUidStr)) {
        member = Array.from(members.values()).find(member => member.uin === memberUinOrUidStr)
      } else {
        member = members.get(memberUinOrUidStr)
      }
      return member
    }
    let member = getMember()
    if (!member) {
      this.groupMembers.set(groupCodeStr, await this.getGroupMembers(groupCodeStr))
      members = this.groupMembers.get(groupCodeStr)!
      member = getMember()
    }
    return member
  }

  async getGroupIgnoreNotifies() {
    await this.getSingleScreenNotifies(14)
    return await this.ctx.ntWindowApi.openWindow<GeneralCallResult & GroupNotifies>(
      NTQQWindows.GroupNotifyFilterWindow,
      [],
      ReceiveCmdS.GROUP_NOTIFY,
    )
  }

  async getSingleScreenNotifies(num: number) {
    invoke(ReceiveCmdS.GROUP_NOTIFY, [], { classNameIsRegister: true })
    return (await invoke<GroupNotifies>(
      'nodeIKernelGroupService/getSingleScreenNotifies',
      [{ doubt: false, startSeq: '', number: num }, null],
      {

        cbCmd: ReceiveCmdS.GROUP_NOTIFY,
        afterFirstCmd: false,
      }
    )).notifies
  }

  async handleGroupRequest(flag: string, operateType: GroupRequestOperateTypes, reason?: string) {
    const flagitem = flag.split('|')
    const groupCode = flagitem[0]
    const seq = flagitem[1]
    const type = parseInt(flagitem[2])
    const session = getSession()
    if (session) {
      return session.getGroupService().operateSysNotify(
        false,
        {
          'operateType': operateType, // 2 拒绝
          'targetMsg': {
            'seq': seq,  // 通知序列号
            'type': type,
            'groupCode': groupCode,
            'postscript': reason || ' ' // 仅传空值可能导致处理失败，故默认给个空格
          }
        })
    } else {
      return await invoke(NTMethod.HANDLE_GROUP_REQUEST, [{
        doubt: false,
        operateMsg: {
          operateType,
          targetMsg: {
            seq,
            type,
            groupCode,
            postscript: reason || ' ' // 仅传空值可能导致处理失败，故默认给个空格
          },
        },
      }, null])
    }
  }

  async quitGroup(groupCode: string) {
    const session = getSession()
    if (session) {
      return session.getGroupService().quitGroup(groupCode)
    } else {
      return await invoke(NTMethod.QUIT_GROUP, [{ groupCode }, null])
    }
  }

  async kickMember(
    groupCode: string,
    kickUids: string[],
    refuseForever = false,
    kickReason = '',
  ) {
    const session = getSession()
    if (session) {
      return session.getGroupService().kickMember(groupCode, kickUids, refuseForever, kickReason)
    } else {
      return await invoke(NTMethod.KICK_MEMBER, [{ groupCode, kickUids, refuseForever, kickReason }])
    }
  }

  async banMember(groupCode: string, memList: Array<{ uid: string, timeStamp: number }>) {
    // timeStamp为秒数, 0为解除禁言
    const session = getSession()
    if (session) {
      return session.getGroupService().setMemberShutUp(groupCode, memList)
    } else {
      return await invoke(NTMethod.MUTE_MEMBER, [{ groupCode, memList }])
    }
  }

  async banGroup(groupCode: string, shutUp: boolean) {
    const session = getSession()
    if (session) {
      return session.getGroupService().setGroupShutUp(groupCode, shutUp)
    } else {
      return await invoke(NTMethod.MUTE_GROUP, [{ groupCode, shutUp }, null])
    }
  }

  async setMemberCard(groupCode: string, memberUid: string, cardName: string) {
    const session = getSession()
    if (session) {
      return session.getGroupService().modifyMemberCardName(groupCode, memberUid, cardName)
    } else {
      return await invoke(NTMethod.SET_MEMBER_CARD, [{ groupCode, uid: memberUid, cardName }, null])
    }
  }

  async setMemberRole(groupCode: string, memberUid: string, role: GroupMemberRole) {
    const session = getSession()
    if (session) {
      return session.getGroupService().modifyMemberRole(groupCode, memberUid, role)
    } else {
      return await invoke(NTMethod.SET_MEMBER_ROLE, [{ groupCode, uid: memberUid, role }, null])
    }
  }

  async setGroupName(groupCode: string, groupName: string) {
    const session = getSession()
    if (session) {
      return session.getGroupService().modifyGroupName(groupCode, groupName, false)
    } else {
      return await invoke(NTMethod.SET_GROUP_NAME, [{ groupCode, groupName }, null])
    }
  }

  async getGroupRemainAtTimes(groupCode: string) {
    return await invoke<
      GeneralCallResult & {
        atInfo: {
          canAtAll: boolean
          RemainAtAllCountForUin: number
          RemainAtAllCountForGroup: number
          atTimesMsg: string
          canNotAtAllMsg: ''
        }
      }
    >(NTMethod.GROUP_AT_ALL_REMAIN_COUNT, [{ groupCode }, null])
  }

  /** 27187 TODO */
  async removeGroupEssence(groupCode: string, msgId: string) {
    const session = getSession()
    // 代码没测过
    // 需要 ob11msgid->msgId + (peer) -> msgSeq + msgRandom
    const data = await session?.getMsgService().getMsgsIncludeSelf({ chatType: 2, guildId: '', peerUid: groupCode }, msgId, 1, false)
    const param = {
      groupCode: groupCode,
      msgRandom: Number(data?.msgList[0].msgRandom),
      msgSeq: Number(data?.msgList[0].msgSeq)
    }
    // GetMsgByShoretID(ShoretID) -> MsgService.getMsgs(Peer,MsgId,1,false) -> 组出参数
    return session?.getGroupService().removeGroupEssence(param)
  }

  /** 27187 TODO */
  async addGroupEssence(groupCode: string, msgId: string) {
    const session = getSession()
    // 代码没测过
    // 需要 ob11msgid->msgId + (peer) -> msgSeq + msgRandom
    const data = await session?.getMsgService().getMsgsIncludeSelf({ chatType: 2, guildId: '', peerUid: groupCode }, msgId, 1, false)
    const param = {
      groupCode: groupCode,
      msgRandom: Number(data?.msgList[0].msgRandom),
      msgSeq: Number(data?.msgList[0].msgSeq)
    }
    // GetMsgByShoretID(ShoretID) -> MsgService.getMsgs(Peer,MsgId,1,false) -> 组出参数
    return session?.getGroupService().addGroupEssence(param)
  }

  async createGroupFileFolder(groupId: string, folderName: string) {
    return await invoke('nodeIKernelRichMediaService/createGroupFolder', [{ groupId, folderName }, null])
  }

  async deleteGroupFileFolder(groupId: string, folderId: string) {
    return await invoke('nodeIKernelRichMediaService/deleteGroupFolder', [{ groupId, folderId }, null])
  }

  async deleteGroupFile(groupId: string, fileIdList: string[]) {
    return await invoke('nodeIKernelRichMediaService/deleteGroupFile', [{ groupId, busIdList: [102], fileIdList }, null])
  }

  async getGroupFileList(groupId: string, fileListForm: GetFileListParam) {
    invoke('nodeIKernelMsgListener/onGroupFileInfoUpdate', [], { classNameIsRegister: true })
    const data = await invoke<{ fileInfo: OnGroupFileInfoUpdateParams }>(
      'nodeIKernelRichMediaService/getGroupFileList',
      [
        {
          groupId,
          fileListForm
        },
        null,
      ],
      {
        cbCmd: 'nodeIKernelMsgListener/onGroupFileInfoUpdate',
        afterFirstCmd: false,
        cmdCB: (payload, result) => payload.fileInfo.reqId === result
      }
    )
    return data.fileInfo.item
  }
}
