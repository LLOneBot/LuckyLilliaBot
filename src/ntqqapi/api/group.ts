import { selfInfo } from '@/common/globalVars'
import {
  GroupMember,
  GroupMemberRole,
  GroupRequestOperateTypes,
  GetFileListParam,
  GroupFileInfo,
  GroupMsgMask,
  GroupNotify,
  GroupNotifyType,
  Group,
  PublishGroupBulletinReq,
  GroupBulletinListResult,
} from '../types'
import { Service, Context } from 'cordis'
import { createReadStream, promises as fsp } from 'node:fs'
import { getMd5BufferFromFile } from '@/common/utils/file'
import { groupCodeToGroupUin } from '@/common/utils'
import { HighwayHttpSession } from '../helper/highway'
import { Media } from '../proto'

declare module 'cordis' {
  interface Context {
    ntGroupApi: NTQQGroupApi
  }
}

export class NTQQGroupApi extends Service {
  static inject = ['qqProtocol']
  private groupsCache: Group[] = []
  private groupCache: Map<number, Group> = new Map()
  private membersCache: Map<number, Map<string, GroupMember>> = new Map()

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

  // TODO: 群成员数量变更时刷新缓存
  async getGroupMembers(groupCode: number, forceUpdate: boolean) {
    if (forceUpdate || !this.membersCache.has(groupCode)) {
      const infos = new Map<string, GroupMember>()
      let cookie: Buffer | undefined = undefined
      while (true) {
        const res = await this.ctx.qqProtocol.fetchGroupMembers(groupCode, cookie)
        for (const member of res.members) {
          infos.set(member.id.uid, {
            uin: member.id.uin,
            uid: member.id.uid,
            nick: member.memberName,
            cardName: member.memberCard.memberCard ?? '',
            specialTitle: member.specialTitle ?? '',
            level: member.level?.level ?? 0,
            joinedAt: member.joinTimestamp,
            lastSpokeAt: member.lastMsgTimestamp,
            shutupExpireTime: member.shutUpTimestamp ?? 0,
            role: member.permission ?? 0
          })
        }
        cookie = res.cookie
        if (!cookie) break
      }
      this.membersCache.set(groupCode, infos)
    }
    return this.membersCache.get(groupCode)!
  }

  async getGroupMemberByUid(groupCode: number, uid: string, forceUpdate: boolean) {
    let members = this.membersCache.get(groupCode)
    if (forceUpdate || !members?.has(uid)) {
      members = await this.getGroupMembers(groupCode, true)
    }
    return members.get(uid)
  }

  async getGroupMemberByUin(groupCode: number, uin: number, forceUpdate: boolean) {
    let members = this.membersCache.get(groupCode)
    const member = members?.values().find(e => e.uin === uin)
    if (forceUpdate || !member) {
      members = await this.getGroupMembers(groupCode, true)
    } else {
      return member
    }
    return members.values().find(e => e.uin === uin)
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

  async setMemberRole(groupCode: number, memberUid: string, isSet: boolean) {
    return await this.ctx.qqProtocol.setGroupMemberAdmin(groupCode, memberUid, isSet)
  }

  async setGroupName(groupCode: string, groupName: string): Promise<{ result: number, errMsg: string }> {
    const resp = await this.ctx.qqProtocol.setGroupName(+groupCode, groupName)
    return { result: resp.errorCode, errMsg: resp.errorMsg }
  }

  async getGroupRemainAtTimes(_groupCode: string): Promise<any> {
    return {
      errCode: 0,
      errMsg: '',
      atInfo: {
        canAtAll: true,
        RemainAtAllCountForGroup: 0,
        RemainAtAllCountForUin: 0,
        atAllRemainCount: 0,
      },
    }
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
    const r = await this.ctx.qqProtocol.createGroupFolder(+groupId, folderName, '/')
    return {
      result: 0,
      errMsg: '',
      resultWithGroupItem: {
        result: { retCode: r.result, retMsg: r.retMsg, clientWording: r.clientWording },
        groupItem: { folderInfo: { folderId: r.folderId, folderName: r.folderName } },
      },
    }
  }

  async deleteGroupFileFolder(groupId: string, folderId: string): Promise<any> {
    await this.ctx.qqProtocol.deleteGroupFolder(+groupId, folderId)
    return {
      result: 0,
      errMsg: '',
      groupFileCommonResult: { retCode: 0, retMsg: '', clientWording: '' },
    }
  }

  async deleteGroupFile(groupId: string, fileIdList: string[], busIdList: number[]): Promise<any> {
    // 协议是单个 fileId 一次调用，多个用 Promise.all 并行删
    const tasks = fileIdList.map((fileId, i) =>
      this.ctx.qqProtocol.deleteGroupFile(+groupId, fileId, busIdList?.[i] ?? 102)
    )
    await Promise.all(tasks)
    return {
      result: 0,
      errMsg: '',
      transGroupFileResult: { result: { retCode: 0, retMsg: '', clientWording: '' } },
    }
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

  async publishGroupBulletin(groupCode: string, req: PublishGroupBulletinReq): Promise<any> {
    return await this.ctx.ntWebApi.publishGroupBulletin(
      groupCode,
      req.text,
      req.pinned,
      0,
      0,
      0,
      req.confirmRequired,
      req.picInfo?.id,
      req.picInfo?.width,
      req.picInfo?.height,
    )
  }

  async uploadGroupBulletinPic(groupCode: string, path: string): Promise<any> {
    return await this.ctx.ntWebApi.uploadGroupBulletinPic(groupCode, path)
  }

  async getGroupRecommendContactArk(groupCode: number) {
    const { ark } = await this.ctx.qqProtocol.getGroupRecommendContactArk(groupCode)
    return ark
  }

  async queryCachedEssenceMsg(groupCode: string, _msgSeq = '0', _msgRandom = '0'): Promise<any> {
    const r = await this.ctx.ntWebApi.queryCachedEssenceMsg(groupCode)
    const items = (r?.data?.msg_list ?? []).map((m: any) => ({
      msgSeq: m.msg_seq,
      msgRandom: m.msg_random,
      msgSenderUin: m.sender_uin,
      msgSenderNick: m.sender_nick,
      opUin: m.add_digest_uin,
      opNick: m.add_digest_nick,
      opTime: m.add_digest_time,
      canBeRemoved: m.can_be_removed,
    }))
    return { items }
  }

  async getGroupHonorList(groupCode: string): Promise<any> {
    return await this.ctx.ntWebApi.getGroupHonorInfo(groupCode, 'all')
  }

  async getGroupBulletinList(groupCode: string): Promise<GroupBulletinListResult> {
    const r = await this.ctx.ntWebApi.getGroupBulletinList(groupCode) as any
    const mapFeed = (f: any): any => ({
      uin: String(f.u),
      feedId: f.fid,
      publishTime: String(f.pubt),
      msg: {
        text: f.msg?.text ?? '',
        textFace: f.msg?.text_face ?? '',
        pics: (f.msg?.pics ?? []).map((p: any) => ({ id: p.id, width: +p.w, height: +p.h })),
        title: f.msg?.title ?? '',
      },
      type: f.type ?? 0,
      fn: f.fn ?? 0,
      cn: f.cn ?? 0,
      vn: f.vn ?? 0,
      settings: {
        isShowEditCard: f.settings?.is_show_edit_card ?? 0,
        remindTs: f.settings?.remind_ts ?? 0,
        tipWindowType: f.settings?.tip_window_type ?? 0,
        confirmRequired: f.settings?.confirm_required ?? 0,
      },
      pinned: f.pinned ?? 0,
      readNum: f.read_num ?? 0,
      is_read: f.is_read ?? 0,
      is_all_confirm: f.is_all_confirm ?? 0,
    })
    return {
      groupCode,
      srvCode: r.srv_code ?? 0,
      readOnly: r.read_only ?? 0,
      role: r.role ?? 0,
      inst: (r.inst ?? []).map(mapFeed),
      feeds: (r.feeds ?? []).map(mapFeed),
      groupInfo: { groupCode, classId: r.group?.class_ext ?? 0 },
      gln: r.gln ?? 0,
      tst: r.tst ?? 0,
      publisherInfos: [],
      server_time: String(r.server_time ?? 0),
      svrt: String(r.svrt ?? 0),
      nextIndex: r.next_index ?? 0,
      jointime: String(r.jointime ?? 0),
    } as GroupBulletinListResult
  }

  /**
   * 设群头像。HTTP-only 上传：PicUp.DataUp + cmd=3000 + GroupAvatarExtra（含 groupUin），
   * 字节级匹配 PMHQ 抓的 NTQQ Windows 客户端。
   *
   * 关键坑：GroupAvatarExtra.groupUin 是**内部 groupUin**，不是用户看到的 groupCode。
   * 错传 groupCode 会被服务器拒绝 "No Perm"（藏在 bytesRspExtendInfo.field4，outer errorCode 是 0）。
   */
  async setGroupAvatar(groupCode: string, filePath: string): Promise<{ result: number, errMsg: string }> {
    const stat = await fsp.stat(filePath)
    const md5 = await getMd5BufferFromFile(filePath)
    const session = await this.ctx.qqProtocol.getHighwaySession()
    const server = session.highwayHostAndPorts[1]?.[0]
    if (!server) return { result: -1, errMsg: 'no highway server (type=1)' }
    const ext = Media.GroupAvatarExtra.encode({
      type: 101,
      groupUin: groupCodeToGroupUin(+groupCode),
      field3: { field1: 1 },
      field5: 3,
      field6: 1,
    })
    const trans = {
      uin: selfInfo.uin,
      cmd: 3000, // 群头像 commandId（PMHQ 抓包验过：与自身头像同走 PicUp.DataUp，仅 cmd 与 ext 不同）
      readable: createReadStream(filePath, { highWaterMark: 1024 * 1024 }),
      sum: md5,
      size: stat.size,
      ticket: session.sigSession,
      ext: Buffer.from(ext),
      server: server.host,
      port: server.port,
    }
    try {
      await new HighwayHttpSession(trans).upload()
      return { result: 0, errMsg: '' }
    } catch (e) {
      return { result: -1, errMsg: (e as Error).message }
    }
  }

  async getGroupFileCount(_groupId: string): Promise<any> {
    return { result: 0, errMsg: '', groupFileCounts: [0] }
  }

  async getGroupFileSpace(_groupId: string): Promise<any> {
    return {
      result: 0,
      errMsg: '',
      groupSpaceResult: { totalSpace: 0, usedSpace: 0, allUpload: 0, allDownload: 0 },
    }
  }

  async setGroupMsgMask(groupCode: number, msgMask: GroupMsgMask) {
    const { body } = await this.ctx.qqProtocol.setGroupMsgMask(groupCode, selfInfo.uid, msgMask)
    return { errCode: body.errCode }
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

  async renameGroupFolder(groupId: string, folderId: string, newFolderName: string): Promise<any> {
    await this.ctx.qqProtocol.renameGroupFolder(+groupId, folderId, newFolderName)
    return { result: 0, errMsg: '' }
  }

  async persistGroupFile(groupCode: number, fileId: string) {
    return await this.ctx.qqProtocol.transGroupFile(groupCode, fileId)
  }

  async getGroupAlbumList(groupId: string): Promise<any> {
    const albums = await this.ctx.qqProtocol.fetchGroupAlbumList(+groupId)
    const album_list = albums.map((a: any) => {
      const photoUrls = a.cover?.image?.photoUrls ?? []
      const defaultUrl = a.cover?.image?.defaultUrl
      return {
        album_id: a.albumId,
        owner: a.owner,
        name: a.name,
        desc: a.desc ?? '',
        create_time: String(a.createTime ?? 0),
        modify_time: String(a.modifyTime ?? 0),
        last_upload_time: String(a.lastUploadTime ?? 0),
        upload_number: String(a.uploadNumber ?? 0),
        cover: {
          type: a.cover?.type ?? 0,
          image: a.cover?.image ? {
            name: '',
            sloc: '',
            lloc: a.cover.image.lloc ?? '',
            photo_url: photoUrls.map((p: any) => ({
              spec: p.spec,
              url: { url: p.url?.url ?? '', width: p.url?.width ?? 0, height: p.url?.height ?? 0 },
            })),
            default_url: defaultUrl ? { url: defaultUrl.url ?? '', width: defaultUrl.width ?? 0, height: defaultUrl.height ?? 0 } : null,
            is_gif: false,
            has_raw: false,
          } : null,
          video: null,
          desc: a.desc ?? '',
          lbs: null,
          uploader: '',
          batch_id: '0',
          upload_time: '0',
          upload_order: 0,
          like: null,
          comment: null,
          upload_user: null,
          ext: [],
          shoot_time: '0',
          link_id: '0',
          op_mask: [],
          lbs_source: 0,
        },
        creator: {
          uid: '',
          nick: a.creator?.nick ?? '',
          uin: a.creator?.uin ?? '',
          yellow_info: null,
          star_info: null,
          is_sweet: false,
          is_special: false,
          is_super_like: false,
          custom_id: '',
          poly_id: '',
          portrait: '',
          can_follow: 0,
          isfollowed: 0,
          ditto_uin: '',
        },
      }
    })
    return { response: { result: 0, errMs: '', album_list } }
  }

  async createGroupAlbum(groupId: string, name: string, desc: string): Promise<any> {
    const album = await this.ctx.qqProtocol.createGroupAlbum(+groupId, name, desc)
    return { response: { result: 0, errMs: '', album_id: album.albumId, name: album.name, desc: album.desc } }
  }

  async deleteGroupAlbum(groupId: string, albumId: string): Promise<any> {
    return await this.ctx.qqProtocol.deleteGroupAlbum(+groupId, albumId)
  }

  async deleteGroupBulletin(groupCode: string, feedsId: string): Promise<any> {
    return await this.ctx.ntWebApi.deleteGroupBulletin(groupCode, feedsId)
  }

  async renameGroupFile(groupId: string, fileId: string, parentFolderId: string, newFileName: string): Promise<any> {
    return await this.ctx.qqProtocol.renameGroupFile(+groupId, fileId, parentFolderId, newFileName)
  }

  async checkGroupMemberCache(_groupCodes: string[]): Promise<any> {
    return { result: 0, errMsg: '' }
  }

  async getGroupAlbumMediaList(groupCode: string, albumId: string, _attachInfo = ''): Promise<any> {
    const r = await this.ctx.qqProtocol.fetchGroupAlbumMediaList(+groupCode, albumId)
    const album = r.album
    const albumOut = album ? {
      album_id: album.albumId, owner: album.owner, name: album.name, desc: album.desc ?? '',
      create_time: String(album.createTime ?? 0), modify_time: String(album.modifyTime ?? 0),
      last_upload_time: String(album.lastUploadTime ?? 0), upload_number: String(album.uploadNumber ?? 0),
      creator: { uid: '', nick: album.creator?.nick ?? '', uin: album.creator?.uin ?? '' },
    } : null
    const media_list = r.mediaList.map((m: any) => ({
      type: m.type ?? 0,
      image: m.image ? {
        name: '', sloc: '', lloc: m.image.lloc ?? '',
        photo_url: (m.image.photoUrls ?? []).map((p: any) => ({
          spec: p.spec, url: { url: p.url?.url ?? '', width: p.url?.width ?? 0, height: p.url?.height ?? 0 },
        })),
        default_url: m.image.defaultUrl ? { url: m.image.defaultUrl.url ?? '', width: m.image.defaultUrl.width ?? 0, height: m.image.defaultUrl.height ?? 0 } : null,
        is_gif: false, has_raw: false,
      } : null,
      video: null, desc: m.desc ?? '', uploader: '', upload_user: { uin: m.uploaderUin ?? '' },
      upload_time: String(m.uploadTime ?? 0), shoot_time: '0',
      batch_id: m.batchId?.key ?? '0',
    }))
    return { response: { result: 0, errMs: '', album: albumOut, media_list, next_attach_info: '', next_has_more: false } }
  }

  async setGroupPin(groupCode: number, isPinned: boolean) {
    return await this.ctx.qqProtocol.setGroupPin(groupCode, isPinned)
  }
}
