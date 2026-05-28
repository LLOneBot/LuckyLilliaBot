import { selfInfo } from '@/common/globalVars'
import {
  GroupMember,
  GroupMsgMask,
  Group,
  ChatType,
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
  private refreshingMembers: Map<number, Promise<void>> = new Map()

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
    if (this.refreshingMembers.has(groupCode)) {
      await this.refreshingMembers.get(groupCode)
    } else if (forceUpdate || !this.membersCache.has(groupCode)) {
      const { promise, resolve } = Promise.withResolvers<void>()
      this.refreshingMembers.set(groupCode, promise)
      const members = []
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
        }
        cookie = res.cookie
        if (!cookie) break
      }
      this.membersCache.set(groupCode, members)
      resolve()
      this.refreshingMembers.delete(groupCode)
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

  async muteGroup(groupCode: number, shutUp: boolean) {
    return await this.ctx.qqProtocol.muteAllGroupMembers(groupCode, shutUp)
  }

  async setGroupMemberCard(groupCode: number, memberUid: string, cardName: string) {
    return await this.ctx.qqProtocol.setGroupMemberCard(groupCode, memberUid, cardName)
  }

  async setGroupMemberAdmin(groupCode: number, memberUid: string, isSet: boolean) {
    return await this.ctx.qqProtocol.setGroupMemberAdmin(groupCode, memberUid, isSet)
  }

  async setGroupName(groupCode: number, groupName: string) {
    return await this.ctx.qqProtocol.setGroupName(groupCode, groupName)
  }

  async getGroupRemainAtTimes(groupCode: number) {
    return await this.ctx.qqProtocol.fetchGroupAtAllRemain(+selfInfo.uin, groupCode)
  }

  async removeGroupEssence(groupCode: number, msgSeq: number, msgRandom: number) {
    return await this.ctx.qqProtocol.setGroupEssence(groupCode, msgSeq, msgRandom, false)
  }

  async addGroupEssence(groupCode: number, msgSeq: number, msgRandom: number) {
    return await this.ctx.qqProtocol.setGroupEssence(groupCode, msgSeq, msgRandom, true)
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

  async setGroupMsgMask(groupCode: number, msgMask: GroupMsgMask) {
    const { body } = await this.ctx.qqProtocol.setGroupMsgMask(groupCode, selfInfo.uid, msgMask)
    return body
  }

  async setGroupRemark(groupCode: string, groupRemark = ''): Promise<any> {
    return await this.ctx.qqProtocol.setGroupRemark(+groupCode, groupRemark)
  }

  async getGroupFileList(groupCode: number, folderId: string, startIndex: number, fileCount: number) {
    return await this.ctx.qqProtocol.getGroupFileList(groupCode, folderId, startIndex, fileCount)
  }

  async getGroupFileCount(groupCode: number) {
    const { countResp } = await this.ctx.qqProtocol.getGroupFileCount(groupCode)
    return countResp!
  }

  async getGroupFileSpace(groupCode: number) {
    const { spaceResp } = await this.ctx.qqProtocol.getGroupFileSpace(groupCode)
    return spaceResp!
  }

  async deleteGroupFile(groupCode: number, fileId: string, busId = 102) {
    return await this.ctx.qqProtocol.deleteGroupFile(groupCode, fileId, busId)
  }

  async moveGroupFile(groupCode: number, fileId: string, curFolderId: string, dstFolderId: string) {
    return await this.ctx.qqProtocol.moveGroupFile(groupCode, fileId, curFolderId, dstFolderId)
  }

  async persistGroupFile(groupCode: number, fileId: string) {
    return await this.ctx.qqProtocol.transGroupFile(groupCode, fileId)
  }

  async renameGroupFile(groupCode: number, fileId: string, parentFolderId: string, newFileName: string) {
    return await this.ctx.qqProtocol.renameGroupFile(groupCode, fileId, parentFolderId, newFileName)
  }

  async createGroupFolder(groupCode: number, folderName: string) {
    return await this.ctx.qqProtocol.createGroupFolder(groupCode, folderName, '/')
  }

  async deleteGroupFolder(groupCode: number, folderId: string) {
    return await this.ctx.qqProtocol.deleteGroupFolder(groupCode, folderId)
  }

  async renameGroupFolder(groupCode: number, folderId: string, newFolderName: string) {
    return await this.ctx.qqProtocol.renameGroupFolder(groupCode, folderId, newFolderName)
  }

  async getGroupAlbumList(groupCode: number) {
    const { status, body } = await this.ctx.qqProtocol.fetchGroupAlbumList(groupCode)
    return {
      status,
      albumList: body?.albums ?? []
    }
  }

  async createGroupAlbum(groupCode: number, name: string, desc: string) {
    const { body } = await this.ctx.qqProtocol.createGroupAlbum(groupCode, name, desc)
    return body?.info
  }

  async deleteGroupAlbum(groupCode: number, albumId: string) {
    return await this.ctx.qqProtocol.deleteGroupAlbum(groupCode, albumId)
  }

  async getGroupAlbumMediaList(groupCode: number, albumId: string) {
    return await this.ctx.qqProtocol.fetchGroupAlbumMediaList(groupCode, albumId)
  }

  async setGroupPin(groupCode: number, isPinned: boolean) {
    return await this.ctx.qqProtocol.setGroupPin(groupCode, isPinned)
  }
}
