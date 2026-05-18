import { ReceiveCmdS } from '../hook'
import {
  GroupMember,
  GroupMemberRole,
  GroupRequestOperateTypes,
  GetFileListParam,
  PublishGroupBulletinReq,
  GroupFileInfo,
  GroupBulletinListResult,
  GroupMsgMask,
  GroupNotify,
  GroupNotifyType,
  Group,
} from '../types'
import { NTMethod } from '../ntcall'
import { Service, Context } from 'cordis'

declare module 'cordis' {
  interface Context {
    ntGroupApi: NTQQGroupApi
  }
}

export class NTQQGroupApi extends Service {
  static inject = ['qqProtocol']
  private groupsCache: Group[] = []
  private groupCache: Map<number, Group> = new Map()

  constructor(protected ctx: Context) {
    super(ctx, 'ntGroupApi')
  }

  // TODO: 群组数量变更时刷新缓存
  async getGroups(forceUpdate: boolean) {
    if (forceUpdate || this.groupsCache.length === 0) {
      const res = await this.ctx.qqProtocol.fetchGroups()
      this.groupsCache = res.groups.map(group => ({
        groupCode: group.groupCode,
        groupName: group.info.groupName,
        ownerUid: group.info.groupOwner.uid,
        createdAt: group.info.createdTime,
        maxMemberCount: group.info.memberMax,
        memberCount: group.info.memberCount,
        description: group.info.richDescription ?? '',
        question: group.info.question ?? '',
        announcementPreview: group.info.announcement ?? '',
        remark: group.personInfo.remark ?? '',
        isPin: !!group.info.topTime,
        groupShutupExpireTime: group.info.groupShutupExpireTime ?? 0,
        personShutupExpireTime: group.personInfo.personShutupExpireTime ?? 0
      }))
    }
    return this.groupsCache
  }

  async getGroup(groupCode: number, forceUpdate: boolean) {
    const groups = await this.getGroups(forceUpdate)
    const group = groups.find(e => e.groupCode === groupCode)
    if (group) {
      return group
    } else if (forceUpdate || !this.groupCache.has(groupCode)) {
      const { info } = await this.ctx.qqProtocol.fetchGroup(groupCode)
      const group = {
        groupCode: info.groupCode,
        groupName: info.results.groupName,
        ownerUid: info.results.ownerUid,
        createdAt: info.results.groupCreateTime,
        maxMemberCount: info.results.maxMemberNum,
        memberCount: info.results.memberNum,
        description: info.results.description ?? '',
        question: info.results.question,
        announcementPreview: '',
        remark: '',
        isPin: false,
        groupShutupExpireTime: 0,
        personShutupExpireTime: info.results.shutUpMeTimestamp
      }
      this.groupCache.set(group.groupCode, group)
      return group
    }
    return this.groupCache.get(groupCode)!
  }

  async getGroupMembers(groupCode: string, forceFetch: boolean = true) {
    try {
      return await this.ctx.qqProtocol.invoke(NTMethod.GROUP_MEMBERS, [groupCode, forceFetch] as any)
    } catch {
      // 直连模式 fallback：拉全员
      const all = await this.ctx.qqProtocol.fetchGroupMembers(+groupCode)
      const infos = new Map<string, GroupMember>()
      for (const m of all) {
        if (m.id?.uid) infos.set(m.id.uid, this.toGroupMember(m))
      }
      return { result: { infos, finish: true, ids: [] } } as any
    }
  }

  async getGroupMember(groupCode: string, uid: string, forceUpdate = false, timeout = 15000) {
    try {
      const data = await this.ctx.qqProtocol.invoke<[
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
          },
          timeout
        },
      )
      return data[2].get(uid)!
    } catch {
      // 直连模式 fallback: OIDB 0xfe7_3 拉群成员列表，找到对应 uid
      return this.getGroupMemberViaOidb(groupCode, uid)
    }
  }

  private memberCache: Map<string, Map<string, GroupMember>> = new Map()

  private async getGroupMemberViaOidb(groupCode: string, uid: string): Promise<GroupMember> {
    let cache = this.memberCache.get(groupCode)
    if (!cache?.has(uid)) {
      const members = await this.ctx.qqProtocol.fetchGroupMembers(+groupCode)
      cache = new Map()
      for (const m of members) {
        const memberUid = m.id?.uid
        if (!memberUid) continue
        cache.set(memberUid, this.toGroupMember(m))
      }
      this.memberCache.set(groupCode, cache)
    }
    const member = cache.get(uid)
    if (member) return member
    // 缓存里没有就构造个空 stub（新成员等）
    return this.toGroupMember({ id: { uid, uin: 0 } })
  }

  private toGroupMember(m: any): GroupMember {
    const role = m.permission === 1 ? GroupMemberRole.Owner
      : m.permission === 2 ? GroupMemberRole.Admin
      : GroupMemberRole.Normal
    return {
      uid: m.id?.uid || '',
      qid: '',
      uin: String(m.id?.uin || 0),
      nick: m.memberName || '',
      remark: '',
      cardType: 0,
      cardName: m.memberCard?.memberCard || '',
      role,
      avatarPath: '',
      shutUpTime: m.shutUpTimestamp || 0,
      isDelete: false,
      isSpecialConcerned: false,
      isSpecialShield: false,
      isRobot: false,
      groupHonor: new Uint8Array(),
      memberRealLevel: m.level?.level || 0,
      memberLevel: m.level?.level || 0,
      globalGroupLevel: 0,
      globalGroupPoint: 0,
      memberTitleId: 0,
      memberSpecialTitle: m.specialTitle || '',
      specialTitleExpireTime: '0',
      userShowFlag: 0,
      userShowFlagNew: 0,
      richFlag: 0,
      mssVipType: 0,
      bigClubLevel: 0,
      bigClubFlag: 0,
      autoRemark: '',
      creditLevel: 0,
    } as GroupMember
  }

  async getSingleScreenNotifies(doubt: boolean, number: number, startSeq = '') {
    try {
      const data = await this.ctx.qqProtocol.invoke<[
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
    } catch {
      // 直连模式 fallback: OIDB 0x10c0
      const res = await this.ctx.qqProtocol.fetchGroupNotifies(number, doubt)
      const notifies: GroupNotify[] = (res.requests || []).map((r: any) => ({
        seq: String(r.sequence),
        type: r.notifyType,
        status: r.requestState,
        group: { groupCode: String(r.group?.groupCode), groupName: r.group?.groupName || '' },
        user1: { uid: r.user1?.uid || '', nickName: r.user1?.nickname || '' },
        user2: { uid: r.user2?.uid || '', nickName: r.user2?.nickname || '' },
        actionUser: { uid: r.user3?.uid || '', nickName: r.user3?.nickname || '' },
        actionTime: String(r.time || 0),
        invitationExt: { srcType: 0, groupCode: '', waitStatus: 0, invitorRole: 0 },
        postscript: r.comment || '',
        repeatSeqs: [],
        warningTips: '',
        templateSeq: '',
        groupFlagExt3: 0,
        joinGroupTransInfo: {},
      }) as unknown as GroupNotify)
      return {
        doubt,
        nextStartSeq: String(res.newLatestSequence || 0),
        notifies,
      }
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
    return await this.ctx.qqProtocol.invoke(NTMethod.HANDLE_GROUP_REQUEST, [doubt, operateMsg])
  }

  async handleGroupRequest(flag: string, operateType: GroupRequestOperateTypes, reason?: string) {
    const flagitem = flag.split('|')
    const groupCode = flagitem[0]
    const seq = flagitem[1]
    const type = +flagitem[2]
    const doubt = flagitem[3] === '1'
    try {
      return await this.operateSysNotify(doubt, {
        operateType,
        targetMsg: {
          seq,
          type,
          groupCode,
          postscript: reason || ' ',
        },
      })
    } catch {
      // 直连模式 fallback：用 OIDB 0x10c8_1 / 0x10c8_2
      // operateType 1=accept, 2=reject (NT 内部值)
      const operation = operateType === GroupRequestOperateTypes.Approve ? 1 : 2
      await this.ctx.qqProtocol.handleGroupRequest(BigInt(seq), type, +groupCode, operation, reason || '', doubt)
    }
  }

  async quitGroup(groupCode: string) {
    try {
      return await this.ctx.qqProtocol.invoke(NTMethod.QUIT_GROUP, [groupCode])
    } catch {
      return await this.ctx.qqProtocol.leaveGroup(+groupCode)
    }
  }

  async kickMember(groupCode: string, kickUids: string[], refuseForever = false, kickReason = '') {
    try {
      return await this.ctx.qqProtocol.invoke(NTMethod.KICK_MEMBER, [groupCode, kickUids, refuseForever, kickReason])
    } catch {
      for (const uid of kickUids) {
        await this.ctx.qqProtocol.kickGroupMember(+groupCode, uid, refuseForever, kickReason)
      }
    }
  }

  /** timeStamp为秒数, 0为解除禁言 */
  async banMember(groupCode: string, memList: Array<{ uid: string, timeStamp: number }>) {
    try {
      return await this.ctx.qqProtocol.invoke(NTMethod.MUTE_MEMBER, [groupCode, memList])
    } catch {
      for (const m of memList) {
        await this.ctx.qqProtocol.muteGroupMember(+groupCode, m.uid, m.timeStamp)
      }
    }
  }

  async banGroup(groupCode: string, shutUp: boolean) {
    try {
      return await this.ctx.qqProtocol.invoke(NTMethod.MUTE_GROUP, [groupCode, shutUp])
    } catch {
      await this.ctx.qqProtocol.muteAllGroupMembers(+groupCode, shutUp)
    }
  }

  async setMemberCard(groupCode: string, memberUid: string, cardName: string) {
    try {
      return await this.ctx.qqProtocol.invoke(NTMethod.SET_MEMBER_CARD, [groupCode, memberUid, cardName])
    } catch {
      await this.ctx.qqProtocol.setGroupMemberCard(+groupCode, memberUid, cardName)
    }
  }

  async setMemberRole(groupCode: string, memberUid: string, role: GroupMemberRole) {
    try {
      return await this.ctx.qqProtocol.invoke(NTMethod.SET_MEMBER_ROLE, [groupCode, memberUid, role])
    } catch {
      await this.ctx.qqProtocol.setGroupMemberAdmin(+groupCode, memberUid, role === GroupMemberRole.Admin)
    }
  }

  async setGroupName(groupCode: string, groupName: string) {
    try {
      return await this.ctx.qqProtocol.invoke(NTMethod.SET_GROUP_NAME, [groupCode, groupName, true])
    } catch {
      await this.ctx.qqProtocol.setGroupName(+groupCode, groupName)
    }
  }

  async getGroupRemainAtTimes(groupCode: string) {
    return await this.ctx.qqProtocol.invoke(NTMethod.GROUP_AT_ALL_REMAIN_COUNT, [groupCode])
  }

  async removeGroupEssence(groupCode: string, msgId: string) {
    const ntMsgApi = this.ctx.get('ntMsgApi')!
    const data = await ntMsgApi.getMsgHistory({ chatType: 2, guildId: '', peerUid: groupCode }, msgId, 1, false)
    const msgRandom = Number(data?.msgList[0].msgRandom)
    const msgSeq = Number(data?.msgList[0].msgSeq)
    try {
      return await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/removeGroupEssence', [{
        groupCode, msgRandom, msgSeq,
      }])
    } catch {
      await this.ctx.qqProtocol.setGroupEssence(+groupCode, msgSeq, msgRandom, false)
    }
  }

  async addGroupEssence(groupCode: string, msgId: string) {
    const ntMsgApi = this.ctx.get('ntMsgApi')!
    const data = await ntMsgApi.getMsgHistory({ chatType: 2, guildId: '', peerUid: groupCode }, msgId, 1, false)
    const msgRandom = Number(data?.msgList[0].msgRandom)
    const msgSeq = Number(data?.msgList[0].msgSeq)
    try {
      return await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/addGroupEssence', [{
        groupCode, msgRandom, msgSeq,
      }])
    } catch {
      await this.ctx.qqProtocol.setGroupEssence(+groupCode, msgSeq, msgRandom, true)
    }
  }

  async createGroupFileFolder(groupId: string, folderName: string) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelRichMediaService/createGroupFolder', [groupId, folderName])
  }

  async deleteGroupFileFolder(groupId: string, folderId: string) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelRichMediaService/deleteGroupFolder', [groupId, folderId])
  }

  async deleteGroupFile(groupId: string, fileIdList: string[], busIdList: number[]) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelRichMediaService/deleteGroupFile', [groupId, busIdList, fileIdList])
  }

  async getGroupFileList(groupId: string, fileListForm: GetFileListParam) {
    const data = await this.ctx.qqProtocol.invoke<GroupFileInfo>(
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
    return await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/publishGroupBulletin', [groupCode, psKey, req])
  }

  async uploadGroupBulletinPic(groupCode: string, path: string) {
    const ntUserApi = this.ctx.get('ntUserApi')!
    const psKey = (await ntUserApi.getPSkey(['qun.qq.com'])).domainPskeyMap.get('qun.qq.com')!
    return await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/uploadGroupBulletinPic', [groupCode, psKey, path])
  }

  async getGroupRecommendContact(groupCode: string) {
    const ret = await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/getGroupRecommendContactArkJson', [groupCode])
    return ret.arkJson
  }

  async queryCachedEssenceMsg(groupCode: string, msgSeq = '0', msgRandom = '0') {
    return await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/queryCachedEssenceMsg', [
      {
        groupCode,
        msgSeq: +msgSeq,
        msgRandom: +msgRandom,
      },
    ])
  }

  async getGroupHonorList(groupCode: string) {
    // 还缺点东西
    return await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/getGroupHonorList', [{
      groupCode: [+groupCode],
    }])
  }

  async getGroupBulletinList(groupCode: string) {
    const ntUserApi = this.ctx.get('ntUserApi')!
    const psKey = (await ntUserApi.getPSkey(['qun.qq.com'])).domainPskeyMap.get('qun.qq.com')!
    const result = await this.ctx.qqProtocol.invoke<[
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
    return await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/setHeader', [path, groupCode])
  }

  async searchMember(groupCode: string, keyword: string) {
    try {
      const sceneId = await this.ctx.qqProtocol.invoke(NTMethod.GROUP_MEMBER_SCENE, [
        groupCode,
        'groupMemberList_MainWindow'
      ])
      const data = await this.ctx.qqProtocol.invoke<[
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
    } catch {
      // 直连模式 fallback: OIDB 拉全员然后本地过滤
      const matched = await this.ctx.qqProtocol.searchGroupMember(+groupCode, keyword)
      const result = new Map<string, GroupMember>()
      for (const m of matched) {
        const uid = m.id?.uid
        if (!uid) continue
        result.set(uid, this.toGroupMember(m))
      }
      return result
    }
  }

  async getGroupFileCount(groupId: string) {
    return await this.ctx.qqProtocol.invoke(
      'nodeIKernelRichMediaService/batchGetGroupFileCount',
      [[groupId]],
    )
  }

  async getGroupFileSpace(groupId: string) {
    return await this.ctx.qqProtocol.invoke(
      'nodeIKernelRichMediaService/getGroupSpace',
      [groupId],
    )
  }

  async setGroupMsgMask(groupCode: string, msgMask: GroupMsgMask) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/setGroupMsgMask', [groupCode, msgMask])
  }

  async setGroupRemark(groupCode: string, groupRemark = '') {
    return await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/modifyGroupRemark', [groupCode, groupRemark])
  }

  async moveGroupFile(groupId: string, fileIdList: string[], curFolderId: string, dstFolderId: string) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelRichMediaService/moveGroupFile', [
      groupId,
      [102],
      fileIdList,
      curFolderId,
      dstFolderId
    ])
  }

  async getGroupShutUpMemberList(groupCode: string): Promise<GroupMember[]> {
    try {
      const res = await this.ctx.qqProtocol.invoke<[
        groupCode: string,
        memList: GroupMember[]
      ]>(
        'nodeIKernelGroupService/getGroupShutUpMemberList',
        [groupCode],
        {
          resultCmd: 'nodeIKernelGroupListener/onShutUpMemberListChanged',
          resultCb: payload => payload[0] === groupCode || payload[0] === '0'
        },
      )
      return res[1]
    } catch {
      // 直连模式 fallback: 拉全员 + 过滤 shutUpTimestamp > now
      const all = await this.ctx.qqProtocol.fetchGroupMembers(+groupCode)
      const now = Math.floor(Date.now() / 1000)
      return all
        .filter((m: any) => m.shutUpTimestamp && m.shutUpTimestamp > now)
        .map((m: any) => this.toGroupMember(m))
    }
  }

  async renameGroupFolder(groupId: string, folderId: string, newFolderName: string) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelRichMediaService/renameGroupFolder', [
      groupId,
      folderId,
      newFolderName,
    ])
  }

  async setGroupFileForever(groupId: string, fileId: string) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelRichMediaService/transGroupFile', [
      groupId,
      fileId
    ])
  }

  async getGroupAlbumList(groupId: string) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelAlbumService/getAlbumList', [{
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
    return await this.ctx.qqProtocol.invoke('nodeIKernelAlbumService/addAlbum', [seq, {
      owner: groupId,
      name,
      desc,
      createTime: '0'
    }])
  }

  async deleteGroupAlbum(groupId: string, albumId: string) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelAlbumService/deleteAlbum', [Date.now(), groupId, albumId])
  }
  async deleteGroupBulletin(groupCode: string, feedsId: string) {
    const ntUserApi = this.ctx.get('ntUserApi')!
    const psKey = (await ntUserApi.getPSkey(['qun.qq.com'])).domainPskeyMap.get('qun.qq.com')!
    return await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/deleteGroupBulletin', [groupCode, psKey, feedsId])
  }

  async renameGroupFile(groupId: string, fileId: string, parentFolderId: string, newFileName: string) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelRichMediaService/renameGroupFile', [
      groupId,
      102,
      fileId,
      parentFolderId,
      newFileName
    ])
  }

  async checkGroupMemberCache(groupCodes: string[]) {
    return await this.ctx.qqProtocol.invoke('nodeIKernelGroupService/checkGroupMemberCache', [groupCodes])
  }

  async getGroupAlbumMediaList(groupCode: string, albumId: string, attachInfo = '') {
    return await this.ctx.qqProtocol.invoke('nodeIKernelAlbumService/getMediaList', [{
      qun_id: groupCode,
      attach_info: attachInfo,
      seq: 0,
      request_time_line: {
        request_invoke_time: '0'
      },
      album_id: albumId,
      lloc: '',
      batch_id: ''
    }])
  }

  async setGroupPin(groupCode: number, isPinned: boolean) {
    return await this.ctx.qqProtocol.setGroupPin(groupCode, isPinned)
  }
}
