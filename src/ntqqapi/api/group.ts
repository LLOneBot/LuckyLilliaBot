import { ReceiveCmdS } from '../hook'
import { Group, GroupMember, GroupMemberRole, GroupNotifies, GroupRequestOperateTypes, GroupNotify } from '../types'
import { invoke, NTClass, NTMethod } from '../ntcall'
import { GeneralCallResult } from '../services'
import { NTQQWindows } from './window'
import { getSession } from '../wrapper'
import { NTEventDispatch } from '@/common/utils/eventTask'
import { NodeIKernelGroupListener } from '../listeners'
import { NodeIKernelGroupService } from '../services'
import { Service, Context } from 'cordis'
import { isNumeric } from '@/common/utils/misc'

declare module 'cordis' {
  interface Context {
    ntGroupApi: NTQQGroupApi
  }
}

export class NTQQGroupApi extends Service {
  private groupMembers: Map<string, Map<string, GroupMember>> = new Map<string, Map<string, GroupMember>>()

  constructor(protected ctx: Context) {
    super(ctx, 'ntGroupApi', true)
  }

  async getGroups(forced = false): Promise<Group[]> {
    if (NTEventDispatch.initialised) {
      type ListenerType = NodeIKernelGroupListener['onGroupListUpdate']
      const [, , groupList] = await NTEventDispatch.CallNormalEvent
        <(force: boolean) => Promise<any>, ListenerType>
        (
          'NodeIKernelGroupService/getGroupList',
          'NodeIKernelGroupListener/onGroupListUpdate',
          1,
          5000,
          () => true,
          forced
        )
      return groupList
    } else {
      const result = await invoke<{
        updateType: number
        groupList: Group[]
      }>({
        className: NTClass.NODE_STORE_API,
        methodName: 'getGroupList',
        cbCmd: ReceiveCmdS.GROUPS_STORE,
        afterFirstCmd: false,
      })
      return result.groupList
    }
  }

  async getGroupMembers(groupQQ: string, num = 3000): Promise<Map<string, GroupMember>> {
    const session = getSession()
    let result: Awaited<ReturnType<NodeIKernelGroupService['getNextMemberList']>>
    if (session) {
      const groupService = session.getGroupService()
      const sceneId = groupService.createMemberListScene(groupQQ, 'groupMemberList_MainWindow')
      result = await groupService.getNextMemberList(sceneId, undefined, num)
    } else {
      const sceneId = await invoke<string>({
        methodName: NTMethod.GROUP_MEMBER_SCENE,
        args: [
          {
            groupCode: groupQQ,
            scene: 'groupMemberList_MainWindow',
          },
        ],
      })
      result = await invoke<
        ReturnType<NodeIKernelGroupService['getNextMemberList']>
      >({
        methodName: NTMethod.GROUP_MEMBERS,
        args: [
          {
            sceneId,
            num,
          },
          null,
        ],
      })
    }
    if (result.errCode !== 0) {
      throw ('获取群成员列表出错,' + result.errMsg)
    }
    return result.result.infos
  }

  async getGroupMember(groupCode: string | number, memberUinOrUid: string | number) {
    const groupCodeStr = groupCode.toString()
    const memberUinOrUidStr = memberUinOrUid.toString()
    let members = this.groupMembers.get(groupCodeStr)
    if (!members) {
      try {
        members = await this.getGroupMembers(groupCodeStr)
        // 更新群成员列表
        this.groupMembers.set(groupCodeStr, members)
      }
      catch (e) {
        return null
      }
    }
    const getMember = () => {
      let member: GroupMember | undefined = undefined
      if (isNumeric(memberUinOrUidStr)) {
        member = Array.from(members!.values()).find(member => member.uin === memberUinOrUidStr)
      } else {
        member = members!.get(memberUinOrUidStr)
      }
      return member
    }
    let member = getMember()
    if (!member) {
      members = await this.getGroupMembers(groupCodeStr)
      this.groupMembers.set(groupCodeStr, members)
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
    if (NTEventDispatch.initialised) {
      const [_retData, _doubt, _seq, notifies] = await NTEventDispatch.CallNormalEvent
        <(arg1: boolean, arg2: string, arg3: number) => Promise<any>, (doubt: boolean, seq: string, notifies: GroupNotify[]) => void>
        (
          'NodeIKernelGroupService/getSingleScreenNotifies',
          'NodeIKernelGroupListener/onGroupSingleScreenNotifies',
          1,
          5000,
          () => true,
          false,
          '',
          num,
        )
      return notifies
    } else {
      invoke({
        methodName: ReceiveCmdS.GROUP_NOTIFY,
        classNameIsRegister: true,
      })
      return (await invoke<GroupNotifies>({
        methodName: NTMethod.GET_GROUP_NOTICE,
        cbCmd: ReceiveCmdS.GROUP_NOTIFY,
        afterFirstCmd: false,
        args: [{ doubt: false, startSeq: '', number: num }, null],
      })).notifies
    }
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
      return await invoke({
        methodName: NTMethod.HANDLE_GROUP_REQUEST,
        args: [
          {
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
          },
          null,
        ],
      })
    }
  }

  async quitGroup(groupQQ: string) {
    const session = getSession()
    if (session) {
      return session.getGroupService().quitGroup(groupQQ)
    } else {
      return await invoke({
        methodName: NTMethod.QUIT_GROUP,
        args: [{ groupCode: groupQQ }, null],
      })
    }
  }

  async kickMember(
    groupQQ: string,
    kickUids: string[],
    refuseForever = false,
    kickReason = '',
  ) {
    const session = getSession()
    if (session) {
      return session.getGroupService().kickMember(groupQQ, kickUids, refuseForever, kickReason)
    } else {
      return await invoke({
        methodName: NTMethod.KICK_MEMBER,
        args: [
          {
            groupCode: groupQQ,
            kickUids,
            refuseForever,
            kickReason,
          },
        ],
      })
    }
  }

  async banMember(groupQQ: string, memList: Array<{ uid: string, timeStamp: number }>) {
    // timeStamp为秒数, 0为解除禁言
    const session = getSession()
    if (session) {
      return session.getGroupService().setMemberShutUp(groupQQ, memList)
    } else {
      return await invoke({
        methodName: NTMethod.MUTE_MEMBER,
        args: [
          {
            groupCode: groupQQ,
            memList,
          },
        ],
      })
    }
  }

  async banGroup(groupQQ: string, shutUp: boolean) {
    const session = getSession()
    if (session) {
      return session.getGroupService().setGroupShutUp(groupQQ, shutUp)
    } else {
      return await invoke({
        methodName: NTMethod.MUTE_GROUP,
        args: [
          {
            groupCode: groupQQ,
            shutUp,
          },
          null,
        ],
      })
    }
  }

  async setMemberCard(groupQQ: string, memberUid: string, cardName: string) {
    const session = getSession()
    if (session) {
      return session.getGroupService().modifyMemberCardName(groupQQ, memberUid, cardName)
    } else {
      return await invoke({
        methodName: NTMethod.SET_MEMBER_CARD,
        args: [
          {
            groupCode: groupQQ,
            uid: memberUid,
            cardName,
          },
          null,
        ],
      })
    }
  }

  async setMemberRole(groupQQ: string, memberUid: string, role: GroupMemberRole) {
    const session = getSession()
    if (session) {
      return session.getGroupService().modifyMemberRole(groupQQ, memberUid, role)
    } else {
      return await invoke({
        methodName: NTMethod.SET_MEMBER_ROLE,
        args: [
          {
            groupCode: groupQQ,
            uid: memberUid,
            role,
          },
          null,
        ],
      })
    }
  }

  async setGroupName(groupQQ: string, groupName: string) {
    const session = getSession()
    if (session) {
      return session.getGroupService().modifyGroupName(groupQQ, groupName, false)
    } else {
      return await invoke({
        methodName: NTMethod.SET_GROUP_NAME,
        args: [
          {
            groupCode: groupQQ,
            groupName,
          },
          null,
        ],
      })
    }
  }

  async getGroupAtAllRemainCount(groupCode: string) {
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
    >({
      methodName: NTMethod.GROUP_AT_ALL_REMAIN_COUNT,
      args: [
        {
          groupCode,
        },
        null,
      ],
    })
  }

  /** 27187 TODO */
  async removeGroupEssence(GroupCode: string, msgId: string) {
    const session = getSession()
    // 代码没测过
    // 需要 ob11msgid->msgId + (peer) -> msgSeq + msgRandom
    let MsgData = await session?.getMsgService().getMsgsIncludeSelf({ chatType: 2, guildId: '', peerUid: GroupCode }, msgId, 1, false)
    let param = {
      groupCode: GroupCode,
      msgRandom: parseInt(MsgData?.msgList[0].msgRandom!),
      msgSeq: parseInt(MsgData?.msgList[0].msgSeq!)
    }
    // GetMsgByShoretID(ShoretID) -> MsgService.getMsgs(Peer,MsgId,1,false) -> 组出参数
    return session?.getGroupService().removeGroupEssence(param)
  }

  /** 27187 TODO */
  async addGroupEssence(GroupCode: string, msgId: string) {
    const session = getSession()
    // 代码没测过
    // 需要 ob11msgid->msgId + (peer) -> msgSeq + msgRandom
    let MsgData = await session?.getMsgService().getMsgsIncludeSelf({ chatType: 2, guildId: '', peerUid: GroupCode }, msgId, 1, false)
    let param = {
      groupCode: GroupCode,
      msgRandom: parseInt(MsgData?.msgList[0].msgRandom!),
      msgSeq: parseInt(MsgData?.msgList[0].msgSeq!)
    }
    // GetMsgByShoretID(ShoretID) -> MsgService.getMsgs(Peer,MsgId,1,false) -> 组出参数
    return session?.getGroupService().addGroupEssence(param)
  }

  async createGroupFileFolder(groupId: string, folderName: string) {
    return await invoke({
      methodName: 'nodeIKernelRichMediaService/createGroupFolder',
      args: [
        {
          groupId,
          folderName
        },
        null,
      ],
    })
  }

  async deleteGroupFileFolder(groupId: string, folderId: string) {
    return await invoke({
      methodName: 'nodeIKernelRichMediaService/deleteGroupFolder',
      args: [
        {
          groupId,
          folderId
        },
        null,
      ],
    })
  }

  async deleteGroupFile(groupId: string, fileIdList: string[]) {
    return await invoke({
      methodName: 'nodeIKernelRichMediaService/deleteGroupFile',
      args: [
        {
          groupId,
          busIdList: [102],
          fileIdList
        },
        null,
      ],
    })
  }
}
