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
  private memberCache: Map<string, Map<string, GroupMember>> = new Map()

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

  async getGroupMembers(groupCode: string, _forceFetch: boolean = true) {
    const all = await this.ctx.qqProtocol.fetchGroupMembers(+groupCode)
    const infos = new Map<string, GroupMember>()
    for (const m of all) {
      if (m.id?.uid) infos.set(m.id.uid, this.toGroupMember(m))
    }
    this.memberCache.set(groupCode, infos)
    return { result: { infos, finish: true, ids: [] } } as any
  }

  async getGroupMember(groupCode: string, uid: string, forceUpdate = false, _timeout = 15000) {
    let cache = this.memberCache.get(groupCode)
    if (forceUpdate || !cache?.has(uid)) {
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

  async getSingleScreenNotifies(doubt: boolean, number: number, _startSeq = '') {
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
  ): Promise<{ result: number, errMsg: string }> {
    const operation = operateMsg.operateType === GroupRequestOperateTypes.Approve ? 1 : 2
    const resp = await this.ctx.qqProtocol.handleGroupRequest(
      BigInt(operateMsg.targetMsg.seq),
      operateMsg.targetMsg.type,
      +operateMsg.targetMsg.groupCode,
      operation,
      operateMsg.targetMsg.postscript || '',
      doubt,
    )
    return { result: resp.errorCode, errMsg: resp.errorMsg }
  }

  async handleGroupRequest(flag: string, operateType: GroupRequestOperateTypes, reason?: string): Promise<{ result: number, errMsg: string }> {
    const flagitem = flag.split('|')
    const groupCode = flagitem[0]
    const seq = flagitem[1]
    const type = +flagitem[2]
    const doubt = flagitem[3] === '1'
    const operation = operateType === GroupRequestOperateTypes.Approve ? 1 : 2
    const resp = await this.ctx.qqProtocol.handleGroupRequest(BigInt(seq), type, +groupCode, operation, reason || '', doubt)
    return { result: resp.errorCode, errMsg: resp.errorMsg }
  }

  async quitGroup(groupCode: string): Promise<{ result: number, errMsg: string }> {
    const resp = await this.ctx.qqProtocol.leaveGroup(+groupCode)
    return { result: resp.errorCode, errMsg: resp.errorMsg }
  }

  async kickMember(groupCode: string, kickUids: string[], refuseForever = false, kickReason = ''): Promise<{ errCode: number, errMsg: string }> {
    let last = { errorCode: 0, errorMsg: '' } as { errorCode: number, errorMsg: string }
    for (const uid of kickUids) {
      last = await this.ctx.qqProtocol.kickGroupMember(+groupCode, uid, refuseForever, kickReason)
    }
    return { errCode: last.errorCode, errMsg: last.errorMsg }
  }

  /** timeStamp为秒数, 0为解除禁言 */
  async banMember(groupCode: string, memList: Array<{ uid: string, timeStamp: number }>): Promise<{ result: number, errMsg: string }> {
    let last = { errorCode: 0, errorMsg: '' } as { errorCode: number, errorMsg: string }
    for (const m of memList) {
      last = await this.ctx.qqProtocol.muteGroupMember(+groupCode, m.uid, m.timeStamp)
    }
    return { result: last.errorCode, errMsg: last.errorMsg }
  }

  async banGroup(groupCode: string, shutUp: boolean): Promise<{ result: number, errMsg: string }> {
    const resp = await this.ctx.qqProtocol.muteAllGroupMembers(+groupCode, shutUp)
    return { result: resp.errorCode, errMsg: resp.errorMsg }
  }

  async setMemberCard(groupCode: string, memberUid: string, cardName: string): Promise<{ result: number, errMsg: string }> {
    const resp = await this.ctx.qqProtocol.setGroupMemberCard(+groupCode, memberUid, cardName)
    return { result: resp.errorCode, errMsg: resp.errorMsg }
  }

  async setMemberRole(groupCode: string, memberUid: string, role: GroupMemberRole): Promise<{ result: number, errMsg: string }> {
    const resp = await this.ctx.qqProtocol.setGroupMemberAdmin(+groupCode, memberUid, role === GroupMemberRole.Admin)
    return { result: resp.errorCode, errMsg: resp.errorMsg }
  }

  async setGroupName(groupCode: string, groupName: string): Promise<{ result: number, errMsg: string }> {
    const resp = await this.ctx.qqProtocol.setGroupName(+groupCode, groupName)
    return { result: resp.errorCode, errMsg: resp.errorMsg }
  }

  async getGroupRemainAtTimes(_groupCode: string): Promise<any> {
    return { atInfo: { atAllRemainCount: 0, canAtAll: true } }
  }

  async removeGroupEssence(groupCode: string, msgId: string): Promise<{ errCode: number, errMsg: string }> {
    const ntMsgApi = this.ctx.get('ntMsgApi')!
    const data = await ntMsgApi.getMsgHistory({ chatType: 2, guildId: '', peerUid: groupCode }, msgId, 1, false)
    const msgRandom = Number(data?.msgList[0].msgRandom)
    const msgSeq = Number(data?.msgList[0].msgSeq)
    const resp = await this.ctx.qqProtocol.setGroupEssence(+groupCode, msgSeq, msgRandom, false)
    return { errCode: resp.errorCode, errMsg: resp.errorMsg }
  }

  async addGroupEssence(groupCode: string, msgId: string): Promise<{ errCode: number, errMsg: string }> {
    const ntMsgApi = this.ctx.get('ntMsgApi')!
    const data = await ntMsgApi.getMsgHistory({ chatType: 2, guildId: '', peerUid: groupCode }, msgId, 1, false)
    const msgRandom = Number(data?.msgList[0].msgRandom)
    const msgSeq = Number(data?.msgList[0].msgSeq)
    const resp = await this.ctx.qqProtocol.setGroupEssence(+groupCode, msgSeq, msgRandom, true)
    return { errCode: resp.errorCode, errMsg: resp.errorMsg }
  }

  async createGroupFileFolder(groupId: string, folderName: string): Promise<any> {
    await this.ctx.qqProtocol.createGroupFolder(+groupId, folderName, '/')
    return { result: 0, errMsg: '' }
  }

  async deleteGroupFileFolder(groupId: string, folderId: string): Promise<any> {
    await this.ctx.qqProtocol.deleteGroupFolder(+groupId, folderId)
    return { result: 0, errMsg: '' }
  }

  async deleteGroupFile(groupId: string, fileIdList: string[], busIdList: number[]): Promise<any> {
    // 协议是单个 fileId 一次调用，多个用 Promise.all 并行删
    const tasks = fileIdList.map((fileId, i) =>
      this.ctx.qqProtocol.deleteGroupFile(+groupId, fileId, busIdList?.[i] ?? 102)
    )
    await Promise.all(tasks)
    return { result: 0, errMsg: '' }
  }

  async getGroupFileList(groupId: string, fileListForm: GetFileListParam): Promise<GroupFileInfo> {
    const folderId = (fileListForm as any)?.folderId ?? '/'
    const startIndex = (fileListForm as any)?.startIndex ?? 0
    const fileCount = (fileListForm as any)?.fileCount ?? 20
    const resp = await this.ctx.qqProtocol.getGroupFileList(+groupId, folderId, startIndex, fileCount)
    const list = resp.listResp
    const items: GroupFileInfo['item'] = []
    for (const it of list?.items ?? []) {
      if (it.folderInfo) {
        items.push({
          peerId: groupId,
          type: 1,
          folderInfo: {
            folderId: it.folderInfo.folderId,
            parentFolderId: it.folderInfo.parentDirectoryId,
            folderName: it.folderInfo.folderName,
            createTime: it.folderInfo.createTime,
            modifyTime: it.folderInfo.modifiedTime,
            createUin: String(it.folderInfo.creatorUin),
            creatorName: it.folderInfo.creatorName,
            totalFileCount: it.folderInfo.totalFileCount,
            modifyUin: '',
            modifyName: '',
            usedSpace: '0',
          },
        } as any)
      } else if (it.fileInfo) {
        items.push({
          peerId: groupId,
          type: 2,
          fileInfo: {
            fileModelId: '',
            fileId: it.fileInfo.fileId,
            fileName: it.fileInfo.fileName,
            fileSize: String(it.fileInfo.fileSize),
            busId: it.fileInfo.busId,
            uploadedSize: String(it.fileInfo.uploadedSize),
            uploadTime: it.fileInfo.uploadedTime,
            deadTime: it.fileInfo.expireTime,
            modifyTime: it.fileInfo.modifiedTime,
            downloadTimes: it.fileInfo.downloadedTimes,
            sha: Buffer.from(it.fileInfo.fileSha1).toString('hex'),
            sha3: '',
            md5: Buffer.from(it.fileInfo.fileMd5).toString('hex'),
            uploaderLocalPath: '',
            uploaderName: it.fileInfo.uploaderName,
            uploaderUin: String(it.fileInfo.uploaderUin),
            parentFolderId: it.fileInfo.parentDirectory,
            localPath: '',
            transStatus: 0,
            transType: 0,
            elementId: '',
            isFolder: false,
          },
        } as any)
      }
    }
    return {
      retCode: list?.retCode ?? 0,
      retMsg: list?.retMsg ?? '',
      clientWording: list?.clientWording ?? '',
      isEnd: !!list?.isEnd,
      item: items,
      allFileCount: list?.allFileCount ?? items.length,
      nextIndex: list?.nextIndex ?? 0,
      reqId: 0,
    }
  }

  async publishGroupBulletin(_groupCode: string, _req: PublishGroupBulletinReq): Promise<any> {
    throw new Error('publishGroupBulletin 暂未实现 (直连模式)')
  }

  async uploadGroupBulletinPic(_groupCode: string, _path: string): Promise<any> {
    throw new Error('uploadGroupBulletinPic 暂未实现 (直连模式)')
  }

  async getGroupRecommendContactArk(groupCode: number) {
    const { ark } = await this.ctx.qqProtocol.getGroupRecommendContactArk(groupCode)
    return ark
  }

  async queryCachedEssenceMsg(_groupCode: string, _msgSeq = '0', _msgRandom = '0'): Promise<any> {
    throw new Error('queryCachedEssenceMsg 暂未实现 (直连模式)')
  }

  async getGroupHonorList(_groupCode: string): Promise<any> {
    throw new Error('getGroupHonorList 暂未实现 (直连模式)')
  }

  async getGroupBulletinList(_groupCode: string): Promise<GroupBulletinListResult> {
    throw new Error('getGroupBulletinList 暂未实现 (直连模式)')
  }

  async setGroupAvatar(_groupCode: string, _path: string): Promise<any> {
    throw new Error('setGroupAvatar 暂未实现 (直连模式)')
  }

  async searchMember(groupCode: string, keyword: string) {
    const matched = await this.ctx.qqProtocol.searchGroupMember(+groupCode, keyword)
    const result = new Map<string, GroupMember>()
    for (const m of matched) {
      const uid = m.id?.uid
      if (!uid) continue
      result.set(uid, this.toGroupMember(m))
    }
    return result
  }

  async getGroupFileCount(_groupId: string): Promise<any> {
    return { groupFileCounts: [0] }
  }

  async getGroupFileSpace(_groupId: string): Promise<any> {
    return { totalSpace: 0, usedSpace: 0, allUpload: 0, allDownload: 0 }
  }

  async setGroupMsgMask(_groupCode: string, _msgMask: GroupMsgMask): Promise<any> {
    throw new Error('setGroupMsgMask 暂未实现 (直连模式)')
  }

  async setGroupRemark(groupCode: string, groupRemark = ''): Promise<any> {
    await this.ctx.qqProtocol.setGroupRemark(+groupCode, groupRemark)
    return { result: 0, errMsg: '' }
  }

  async moveGroupFile(groupId: string, fileIdList: string[], curFolderId: string, dstFolderId: string): Promise<any> {
    await Promise.all(fileIdList.map((fileId) =>
      this.ctx.qqProtocol.moveGroupFile(+groupId, fileId, curFolderId, dstFolderId)
    ))
    return { result: 0, errMsg: '' }
  }

  async getGroupShutUpMemberList(groupCode: string): Promise<GroupMember[]> {
    const all = await this.ctx.qqProtocol.fetchGroupMembers(+groupCode)
    const now = Math.floor(Date.now() / 1000)
    return all
      .filter((m: any) => m.shutUpTimestamp && m.shutUpTimestamp > now)
      .map((m: any) => this.toGroupMember(m))
  }

  async renameGroupFolder(groupId: string, folderId: string, newFolderName: string): Promise<any> {
    await this.ctx.qqProtocol.renameGroupFolder(+groupId, folderId, newFolderName)
    return { result: 0, errMsg: '' }
  }

  async setGroupFileForever(_groupId: string, _fileId: string): Promise<any> {
    throw new Error('setGroupFileForever 暂未实现 (直连模式)')
  }

  async getGroupAlbumList(_groupId: string): Promise<any> {
    throw new Error('getGroupAlbumList 暂未实现 (直连模式)')
  }

  async createGroupAlbum(_groupId: string, _name: string, _desc: string): Promise<any> {
    throw new Error('createGroupAlbum 暂未实现 (直连模式)')
  }

  async deleteGroupAlbum(_groupId: string, _albumId: string): Promise<any> {
    throw new Error('deleteGroupAlbum 暂未实现 (直连模式)')
  }

  async deleteGroupBulletin(_groupCode: string, _feedsId: string): Promise<any> {
    throw new Error('deleteGroupBulletin 暂未实现 (直连模式)')
  }

  async renameGroupFile(_groupId: string, _fileId: string, _parentFolderId: string, _newFileName: string): Promise<any> {
    throw new Error('renameGroupFile 暂未实现 (直连模式)')
  }

  async checkGroupMemberCache(_groupCodes: string[]): Promise<any> {
    return { result: 0, errMsg: '' }
  }

  async getGroupAlbumMediaList(_groupCode: string, _albumId: string, _attachInfo = ''): Promise<any> {
    throw new Error('getGroupAlbumMediaList 暂未实现 (直连模式)')
  }

  async setGroupPin(groupCode: number, isPinned: boolean) {
    return await this.ctx.qqProtocol.setGroupPin(groupCode, isPinned)
  }
}
