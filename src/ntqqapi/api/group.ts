import { ReceiveCmdS } from '../hook'
import {
  GroupSimpleInfo,
  GroupMember,
  GroupMemberRole,
  GroupRequestOperateTypes,
  GetFileListParam,
  PublishGroupBulletinReq,
  GroupAllInfo,
  GroupFileInfo,
  GroupBulletinListResult,
  GroupMsgMask,
  GroupNotify,
  GroupNotifyType,
} from '../types'
import { invoke, NTMethod } from '../ntcall'
import { Service, Context } from 'cordis'

declare module 'cordis' {
  interface Context {
    ntGroupApi: NTQQGroupApi
  }
}

export class NTQQGroupApi extends Service {
  constructor(protected ctx: Context) {
    super(ctx, 'ntGroupApi', true)
  }

  async getGroups(forceFetch = true): Promise<GroupSimpleInfo[]> {
    const result = await invoke<[
      updateType: number,
      groupList: GroupSimpleInfo[]
    ]>(
      'nodeIKernelGroupService/getGroupList',
      [forceFetch],
      {
        resultCmd: 'nodeIKernelGroupListener/onGroupListUpdate',
      },
    )
    return result[1]
  }

  async getGroupMembers(groupCode: string, forceFetch: boolean = true) {
    return await invoke(NTMethod.GROUP_MEMBERS, [groupCode, forceFetch])
  }

  async getGroupMember(groupCode: string, uid: string, forceUpdate = false) {
    const data = await invoke<[
      groupCode: string,
      dataSource: number,
      members: Map<string, GroupMember>
    ]>(
      'nodeIKernelGroupService/getMemberInfo',
      [
        groupCode,
        [uid],
        forceUpdate,
      ],
      {
        resultCmd: 'nodeIKernelGroupListener/onMemberInfoChange',
        resultCb: result => {
          return result[0] === groupCode && result[2].has(uid)
        }
      },
    )
    return data[2].get(uid)!
  }

  async getSingleScreenNotifies(doubt: boolean, number: number, startSeq = '') {
    const data = await invoke<[
      doubt: boolean,
      nextStartSeq: string,
      notifies: GroupNotify[]
    ]>(
      'nodeIKernelGroupService/getSingleScreenNotifies',
      [doubt, startSeq, number],
      {
        resultCmd: ReceiveCmdS.GROUP_NOTIFY,
        resultCb: result => {
          return result[0] === doubt && (startSeq !== '' ? startSeq === result[2][0].seq : true)
        }
      },
    )
    return {
      doubt: data[0],
      nextStartSeq: data[1],
      notifies: data[2]
    }
  }

  async getGroupRequest(): Promise<{ notifies: GroupNotify[], normalCount: number }> {
    const normal = await this.getSingleScreenNotifies(false, 50)
    const normalCount = normal.notifies.length
    const doubt = await this.getSingleScreenNotifies(true, 50)
    normal.notifies.push(...doubt.notifies)
    return { notifies: normal.notifies, normalCount }
  }

  async operateSysNotify(
    doubt: boolean,
    operateMsg: {
      operateType: GroupRequestOperateTypes
      targetMsg: {
        seq: string
        type: GroupNotifyType
        groupCode: string
        postscript: string
      }
    }
  ) {
    return await invoke(NTMethod.HANDLE_GROUP_REQUEST, [doubt, operateMsg])
  }

  async handleGroupRequest(flag: string, operateType: GroupRequestOperateTypes, reason?: string) {
    const flagitem = flag.split('|')
    const groupCode = flagitem[0]
    const seq = flagitem[1]
    const type = +flagitem[2]
    const doubt = flagitem[3] === '1'
    return await this.operateSysNotify(doubt, {
      operateType,
      targetMsg: {
        seq,
        type,
        groupCode,
        postscript: reason || ' ', // 仅传空值可能导致处理失败，故默认给个空格
      },
    })
  }

  async quitGroup(groupCode: string) {
    return await invoke(NTMethod.QUIT_GROUP, [groupCode])
  }

  async kickMember(groupCode: string, kickUids: string[], refuseForever = false, kickReason = '') {
    return await invoke(NTMethod.KICK_MEMBER, [groupCode, kickUids, refuseForever, kickReason])
  }

  /** timeStamp为秒数, 0为解除禁言 */
  async banMember(groupCode: string, memList: Array<{ uid: string, timeStamp: number }>) {
    return await invoke(NTMethod.MUTE_MEMBER, [groupCode, memList])
  }

  async banGroup(groupCode: string, shutUp: boolean) {
    return await invoke(NTMethod.MUTE_GROUP, [groupCode, shutUp])
  }

  async setMemberCard(groupCode: string, memberUid: string, cardName: string) {
    return await invoke(NTMethod.SET_MEMBER_CARD, [groupCode, memberUid, cardName])
  }

  async setMemberRole(groupCode: string, memberUid: string, role: GroupMemberRole) {
    return await invoke(NTMethod.SET_MEMBER_ROLE, [groupCode, memberUid, role])
  }

  async setGroupName(groupCode: string, groupName: string) {
    return await invoke(NTMethod.SET_GROUP_NAME, [groupCode, groupName, true])
  }

  async getGroupRemainAtTimes(groupCode: string) {
    return await invoke(NTMethod.GROUP_AT_ALL_REMAIN_COUNT, [groupCode])
  }

  async removeGroupEssence(groupCode: string, msgId: string) {
    const ntMsgApi = this.ctx.get('ntMsgApi')!
    const data = await ntMsgApi.getMsgHistory({ chatType: 2, guildId: '', peerUid: groupCode }, msgId, 1, false)
    return await invoke('nodeIKernelGroupService/removeGroupEssence', [{
      groupCode: groupCode,
      msgRandom: Number(data?.msgList[0].msgRandom),
      msgSeq: Number(data?.msgList[0].msgSeq),
    }])
  }

  async addGroupEssence(groupCode: string, msgId: string) {
    const ntMsgApi = this.ctx.get('ntMsgApi')!
    const data = await ntMsgApi.getMsgHistory({ chatType: 2, guildId: '', peerUid: groupCode }, msgId, 1, false)
    return await invoke('nodeIKernelGroupService/addGroupEssence', [
      {
        groupCode: groupCode,
        msgRandom: Number(data?.msgList[0].msgRandom),
        msgSeq: Number(data?.msgList[0].msgSeq),

      }])
  }

  async createGroupFileFolder(groupId: string, folderName: string) {
    return await invoke('nodeIKernelRichMediaService/createGroupFolder', [groupId, folderName])
  }

  async deleteGroupFileFolder(groupId: string, folderId: string) {
    return await invoke('nodeIKernelRichMediaService/deleteGroupFolder', [groupId, folderId])
  }

  async deleteGroupFile(groupId: string, fileIdList: string[], busIdList: number[]) {
    return await invoke('nodeIKernelRichMediaService/deleteGroupFile', [groupId, busIdList, fileIdList])
  }

  async getGroupFileList(groupId: string, fileListForm: GetFileListParam) {
    const data = await invoke<GroupFileInfo>(
      'nodeIKernelRichMediaService/getGroupFileList',
      [
        groupId,
        fileListForm,
      ],
      {
        resultCmd: 'nodeIKernelMsgListener/onGroupFileInfoUpdate',
        resultCb: (payload, reqId) => {
          return payload.reqId === reqId
        },
      },
    )
    return data
  }

  async publishGroupBulletin(groupCode: string, req: PublishGroupBulletinReq) {
    const ntUserApi = this.ctx.get('ntUserApi')!
    const psKey = (await ntUserApi.getPSkey(['qun.qq.com'])).domainPskeyMap.get('qun.qq.com')!
    return await invoke('nodeIKernelGroupService/publishGroupBulletin', [groupCode, psKey, req])
  }

  async uploadGroupBulletinPic(groupCode: string, path: string) {
    const ntUserApi = this.ctx.get('ntUserApi')!
    const psKey = (await ntUserApi.getPSkey(['qun.qq.com'])).domainPskeyMap.get('qun.qq.com')!
    return await invoke('nodeIKernelGroupService/uploadGroupBulletinPic', [groupCode, psKey, path])
  }

  async getGroupRecommendContact(groupCode: string) {
    const ret = await invoke('nodeIKernelGroupService/getGroupRecommendContactArkJson', [groupCode])
    return ret.arkJson
  }

  async queryCachedEssenceMsg(groupCode: string, msgSeq = '0', msgRandom = '0') {
    return await invoke('nodeIKernelGroupService/queryCachedEssenceMsg', [
      {
        groupCode,
        msgSeq: +msgSeq,
        msgRandom: +msgRandom,
      },
    ])
  }

  async getGroupHonorList(groupCode: string) {
    // 还缺点东西
    return await invoke('nodeIKernelGroupService/getGroupHonorList', [{
      groupCode: [+groupCode],
    }])
  }

  async getGroupAllInfo(groupCode: string) {
    return await invoke(
      'nodeIKernelGroupService/getGroupAllInfo',
      [
        groupCode,
        4,
      ],
      {
        resultCmd: 'nodeIKernelGroupListener/onGroupAllInfoChange',
        resultCb: payload => {
          return payload.groupCode === groupCode
        },
      },
    )
  }

  async getGroupBulletinList(groupCode: string) {
    const ntUserApi = this.ctx.get('ntUserApi')!
    const psKey = (await ntUserApi.getPSkey(['qun.qq.com'])).domainPskeyMap.get('qun.qq.com')!
    const result = await invoke<[
      groupCode: string,
      context: string,
      result: GroupBulletinListResult
    ]>(
      'nodeIKernelGroupService/getGroupBulletinList',
      [
        groupCode,
        psKey,
        '',
        {
          startIndex: -1,
          num: 20,
          needInstructionsForJoinGroup: 1,
          needPublisherInfo: 1,
        },
      ],
      {
        resultCmd: 'nodeIKernelGroupListener/onGetGroupBulletinListResult',
        resultCb: payload => payload[0] === groupCode,
      },
    )
    return result[2]
  }

  async setGroupAvatar(groupCode: string, path: string) {
    return await invoke('nodeIKernelGroupService/setHeader', [path, groupCode])
  }

  async searchMember(groupCode: string, keyword: string) {
    // 须在获取群成员列表后使用
    const sceneId = await invoke(NTMethod.GROUP_MEMBER_SCENE, [
      groupCode,
      'groupMemberList_MainWindow'
    ])
    const data = await invoke<[
      sceneId: string,
      keyword: string,
      ids: { uid: string, index: number }[],
      infos: Map<string, GroupMember>
    ]>(
      'nodeIKernelGroupService/searchMember',
      [sceneId, keyword],
      {
        resultCmd: 'nodeIKernelGroupListener/onSearchMemberChange',
        resultCb: payload => {
          return payload[0] === sceneId && payload[1] === keyword
        },
      },
    )
    return data[3]
  }

  async getGroupFileCount(groupId: string) {
    return await invoke(
      'nodeIKernelRichMediaService/batchGetGroupFileCount',
      [[groupId]],
    )
  }

  async getGroupFileSpace(groupId: string) {
    return await invoke(
      'nodeIKernelRichMediaService/getGroupSpace',
      [groupId],
    )
  }

  async setGroupMsgMask(groupCode: string, msgMask: GroupMsgMask) {
    return await invoke('nodeIKernelGroupService/setGroupMsgMask', [groupCode, msgMask])
  }

  async setGroupRemark(groupCode: string, groupRemark = '') {
    return await invoke('nodeIKernelGroupService/modifyGroupRemark', [groupCode, groupRemark])
  }

  async moveGroupFile(groupId: string, fileIdList: string[], curFolderId: string, dstFolderId: string) {
    return await invoke('nodeIKernelRichMediaService/moveGroupFile', [
      groupId,
      [102],
      fileIdList,
      curFolderId,
      dstFolderId
    ])
  }

  async getGroupShutUpMemberList(groupCode: string) {
    const res = await invoke<[
      groupCode: string,
      memList: GroupMember[]
    ]>(
      'nodeIKernelGroupService/getGroupShutUpMemberList',
      [groupCode],
      {
        resultCmd: 'nodeIKernelGroupListener/onShutUpMemberListChanged',
        resultCb: payload => payload[0] === groupCode,
      },
    )
    return res[1]
  }

  async renameGroupFolder(groupId: string, folderId: string, newFolderName: string) {
    return await invoke('nodeIKernelRichMediaService/renameGroupFolder', [
      groupId,
      folderId,
      newFolderName,
    ])
  }

  async setGroupFileForever(groupId: string, fileId: string) {
    return await invoke('nodeIKernelRichMediaService/transGroupFile', [
      groupId,
      fileId
    ])
  }

  async getGroupAlbumList(groupId: string) {
    return await invoke('nodeIKernelAlbumService/getAlbumList', [{
      qun_id: groupId,
      seq: 0,
      attach_info: '',
      request_time_line: {
        request_invoke_time: '0'
      }
    }])
  }

  async createGroupAlbum(groupId: string, name: string, desc: string) {
    const seq = Date.now()
    return await invoke('nodeIKernelAlbumService/addAlbum', [seq, {
      owner: groupId,
      name,
      desc,
      createTime: '0'
    }])
  }

  async deleteGroupAlbum(groupId: string, albumId: string) {
    return await invoke('nodeIKernelAlbumService/deleteAlbum', [Date.now(), groupId, albumId])
  }
  async deleteGroupBulletin(groupCode: string, feedsId: string) {
    const ntUserApi = this.ctx.get('ntUserApi')!
    const psKey = (await ntUserApi.getPSkey(['qun.qq.com'])).domainPskeyMap.get('qun.qq.com')!
    return await invoke('nodeIKernelGroupService/deleteGroupBulletin', [groupCode, psKey, feedsId])
  }

  async renameGroupFile(groupId: string, fileId: string, parentFolderId: string, newFileName: string) {
    return await invoke('nodeIKernelRichMediaService/renameGroupFile', [
      groupId,
      102,
      fileId,
      parentFolderId,
      newFileName
    ])
  }

  async checkGroupMemberCache(groupCodes: string[]) {
    return await invoke('nodeIKernelGroupService/checkGroupMemberCache', [groupCodes])
  }

  async setTop(groupCode: string, isTop: boolean) {
    return await invoke('nodeIKernelGroupService/setTop', [groupCode, isTop])
  }
}
