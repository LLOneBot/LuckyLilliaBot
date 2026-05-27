import { selfInfo } from '@/common/globalVars'
import {
  GroupMember,
  GetFileListParam,
  GroupFileInfo,
  GroupMsgMask,
  Group,
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
  static inject = ['qqProtocol', 'store']
  private groupsCache: Group[] = []
  private groupCache: Map<number, Group> = new Map()
  private membersCache: Map<number, GroupMember[]> = new Map()

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
      const members = []
      const ids = []
      let cookie: Buffer | undefined
      while (true) {
        const res = await this.ctx.qqProtocol.fetchGroupMembers(groupCode, cookie)
        for (const member of res.members) {
          members.push({
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
          ids.push(member.id)
        }
        cookie = res.cookie
        if (!cookie) break
      }
      this.ctx.store.addUix(ids).catch(e => this.ctx.logger.warn(e))
      this.membersCache.set(groupCode, members)
    }
    return this.membersCache.get(groupCode)!
  }

  async getGroupMemberByUid(groupCode: number, uid: string, forceUpdate: boolean) {
    let members = this.membersCache.get(groupCode)
    const member = members?.find(e => e.uid === uid)
    if (forceUpdate || !member) {
      members = await this.getGroupMembers(groupCode, true)
    } else {
      return member
    }
    return members.find(e => e.uid === uid)
  }

  async getGroupMemberByUin(groupCode: number, uin: number, forceUpdate: boolean) {
    let members = this.membersCache.get(groupCode)
    const member = members?.find(e => e.uin === uin)
    if (forceUpdate || !member) {
      members = await this.getGroupMembers(groupCode, true)
    } else {
      return member
    }
    return members.find(e => e.uin === uin)
  }

  async getGroupNotifications(doubt: boolean, count: number, startSeq?: bigint) {
    const res = await this.ctx.qqProtocol.fetchGroupNotifies(
      count,
      doubt,
      startSeq ? BigInt(startSeq) : undefined
    )
    return {
      nextStartSeq: res.newLatestSequence,
      notifications: res.requests
    }
  }

  async setGroupRequest(
    doubt: boolean,
    groupCode: number,
    seq: number,
    type: number,
    accept: boolean,
    reason = ''
  ) {
    return await this.ctx.qqProtocol.handleGroupRequest(
      BigInt(seq),
      type,
      groupCode,
      accept ? 1 : 2,
      reason,
      doubt,
    )
  }

  async quitGroup(groupCode: number) {
    return await this.ctx.qqProtocol.leaveGroup(groupCode)
  }

  async kickGroupMember(groupCode: number, kickUids: string[], refuseForever = false, kickReason = '') {
    return await this.ctx.qqProtocol.kickGroupMember(groupCode, kickUids, refuseForever, kickReason)
  }

  /** duration 为秒数，为 0 时解除禁言 */
  async muteGroupMember(groupCode: number, memList: { uid: string, duration: number }[]) {
    return await this.ctx.qqProtocol.muteGroupMember(+groupCode, memList)
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

  async getGroupRecommendContactArk(groupCode: number) {
    const { ark } = await this.ctx.qqProtocol.getGroupRecommendContactArk(groupCode)
    return ark
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

  async getGroupFileCount(groupId: string): Promise<{ fileCount: number, limitCount: number }> {
    const r = await this.ctx.qqProtocol.getGroupFileCount(+groupId)
    return {
      fileCount: r?.fileCount ?? 0,
      limitCount: r?.limitCount ?? 10000,
    }
  }

  async getGroupFileSpace(groupId: string): Promise<{ totalSpace: number, usedSpace: number }> {
    const r = await this.ctx.qqProtocol.getGroupFileSpace(+groupId)
    return {
      totalSpace: Number(r?.totalSpace ?? 0n),
      usedSpace: Number(r?.usedSpace ?? 0n),
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
