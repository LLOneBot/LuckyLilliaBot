import fs from 'node:fs'
import { Service, Context } from 'cordis'
import { registerCallHook, registerReceiveHook, ReceiveCmdS } from './hook'
import { MessageUnique } from '../common/utils/messageUnique'
import { Config as LLOBConfig } from '../common/types'
import { llonebotError } from '../common/globalVars'
import { isNumeric } from '../common/utils/misc'
import { NTMethod } from './ntcall'
import {
  RawMessage,
  GroupNotify,
  FriendRequestNotify,
  FriendRequest,
  GroupMember,
  CategoryFriend,
  SimpleInfo,
  User,
  ChatType
} from './types'
import { selfInfo } from '../common/globalVars'
import { version } from '../version'
import { invoke } from './ntcall'

declare module 'cordis' {
  interface Context {
    app: Core
  }
  interface Events {
    'nt/message-created': (input: RawMessage[]) => void
    'nt/message-deleted': (input: RawMessage) => void
    'nt/message-sent': (input: RawMessage) => void
    'nt/group-notify': (input: GroupNotify[]) => void
    'nt/friend-request': (input: FriendRequest[]) => void
    'nt/group-member-info-updated': (input: { groupCode: string, members: GroupMember[] }) => void
    'nt/system-message-created': (input: Uint8Array) => void
  }
}

class Core extends Service {
  static inject = ['ntMsgApi', 'ntFriendApi', 'ntGroupApi']

  constructor(protected ctx: Context, public config: Core.Config) {
    super(ctx, 'app', true)
  }

  public start() {
    llonebotError.otherError = ''
    MessageUnique.init(selfInfo.uin)
    this.registerListener()
    this.ctx.logger.info(`LLOneBot/${version}`)
    this.ctx.on('llonebot/config-updated', input => {
      Object.assign(this.config, input)
    })
  }

  private registerListener() {
    registerReceiveHook<{
      data: CategoryFriend[]
    }>(ReceiveCmdS.FRIENDS, (payload) => {
      type V2data = { userSimpleInfos: Map<string, SimpleInfo> }
      let friendList: User[] = []
      if ('userSimpleInfos' in payload) {
        friendList = Object.values((payload as unknown as V2data).userSimpleInfos).map((v: SimpleInfo) => {
          return {
            ...v.coreInfo,
          }
        })
      } else {
        for (const fData of payload.data) {
          friendList.push(...fData.buddyList)
        }
      }
      this.ctx.logger.info('好友列表变动', friendList.length)
      for (const friend of friendList) {
        this.ctx.ntMsgApi.activateChat({ peerUid: friend.uid, chatType: ChatType.friend })
      }
    })

    // 自动清理新消息文件
    registerReceiveHook<{ msgList: Array<RawMessage> }>([ReceiveCmdS.NEW_MSG, ReceiveCmdS.NEW_ACTIVE_MSG], (payload) => {
      if (!this.config.autoDeleteFile) {
        return
      }
      for (const message of payload.msgList) {
        for (const msgElement of message.elements) {
          setTimeout(() => {
            const picPath = msgElement.picElement?.sourcePath
            const picThumbPath = [...(msgElement.picElement?.thumbPath ?? []).values()]
            const pttPath = msgElement.pttElement?.filePath
            const filePath = msgElement.fileElement?.filePath
            const videoPath = msgElement.videoElement?.filePath
            const videoThumbPath = [...(msgElement.videoElement?.thumbPath ?? []).values()]
            const pathList = [picPath, ...picThumbPath, pttPath, filePath, videoPath, ...videoThumbPath]
            if (msgElement.picElement) {
              pathList.push(...Object.values(msgElement.picElement.thumbPath))
            }
            for (const path of pathList) {
              if (path) {
                fs.unlink(path, () => {
                  this.ctx.logger.info('删除文件成功', path)
                })
              }
            }
          }, this.config.autoDeleteFileSecond! * 1000)
        }
      }
    })

    registerReceiveHook<{ info: { status: number } }>(ReceiveCmdS.SELF_STATUS, (info) => {
      Object.assign(selfInfo, { online: info.info.status !== 20 })
    })

    const activatedPeerUids: string[] = []
    registerReceiveHook<{
      changedRecentContactLists: {
        listType: number
        sortedContactList: string[]
        changedList: {
          id: string // peerUid
          chatType: ChatType
        }[]
      }[]
    }>(ReceiveCmdS.RECENT_CONTACT, async (payload) => {
      for (const recentContact of payload.changedRecentContactLists) {
        for (const contact of recentContact.changedList) {
          if (activatedPeerUids.includes(contact.id)) continue
          activatedPeerUids.push(contact.id)
          const peer = { peerUid: contact.id, chatType: contact.chatType }
          if (contact.chatType === ChatType.temp) {
            this.ctx.ntMsgApi.activateChatAndGetHistory(peer).then(() => {
              this.ctx.ntMsgApi.getMsgHistory(peer, '', 20).then(({ msgList }) => {
                const lastTempMsg = msgList.at(-1)
                if (Date.now() / 1000 - Number(lastTempMsg?.msgTime) < 5) {
                  this.ctx.parallel('nt/message-created', [lastTempMsg!])
                }
              })
            })
          }
          else {
            this.ctx.ntMsgApi.activateChat(peer)
          }
        }
      }
    })

    registerCallHook(NTMethod.DELETE_ACTIVE_CHAT, async (payload) => {
      const peerUid = payload[0] as string
      this.ctx.logger.info('激活的聊天窗口被删除，准备重新激活', peerUid)
      let chatType = ChatType.friend
      if (isNumeric(peerUid)) {
        chatType = ChatType.group
      }
      else if (!(await this.ctx.ntFriendApi.isBuddy(peerUid))) {
        chatType = ChatType.temp
      }
      const peer = { peerUid, chatType }
      await this.ctx.sleep(1000)
      this.ctx.ntMsgApi.activateChat(peer).then((r) => {
        this.ctx.logger.info('重新激活聊天窗口', peer, { result: r.result, errMsg: r.errMsg })
      })
    })

    registerReceiveHook<{
      groupCode: string
      dataSource: number
      members: Set<GroupMember>
    }>(ReceiveCmdS.GROUP_MEMBER_INFO_UPDATE, async (payload) => {
      const groupCode = payload.groupCode
      const members = Array.from(payload.members.values())
      this.ctx.parallel('nt/group-member-info-updated', { groupCode, members })
    })

    registerReceiveHook<{ msgList: RawMessage[] }>([ReceiveCmdS.NEW_MSG, ReceiveCmdS.NEW_ACTIVE_MSG], payload => {
      this.ctx.parallel('nt/message-created', payload.msgList)
    })

    const sentMsgIds = new Map<string, boolean>()
    const recallMsgIds: string[] = [] // 避免重复上报

    registerReceiveHook<{ msgList: RawMessage[] }>([ReceiveCmdS.UPDATE_MSG], payload => {
      for (const msg of payload.msgList) {
        if (msg.recallTime !== '0' && !recallMsgIds.includes(msg.msgId)) {
          recallMsgIds.push(msg.msgId)
          this.ctx.parallel('nt/message-deleted', msg)
        } else if (sentMsgIds.get(msg.msgId)) {
          sentMsgIds.delete(msg.msgId)
          this.ctx.parallel('nt/message-sent', msg)
        }
      }
    })

    registerReceiveHook<{ msgRecord: RawMessage }>(ReceiveCmdS.SELF_SEND_MSG, payload => {
      if (!this.config.reportSelfMessage) {
        return
      }
      sentMsgIds.set(payload.msgRecord.msgId, true)
    })

    const groupNotifyFlags: string[] = []
    registerReceiveHook<{
      doubt: boolean
      oldestUnreadSeq: string
      unreadCount: number
    }>(ReceiveCmdS.UNREAD_GROUP_NOTIFY, async (payload) => {
      if (payload.unreadCount) {
        let notifies: GroupNotify[]
        try {
          notifies = (await this.ctx.ntGroupApi.getSingleScreenNotifies(14)).slice(0, payload.unreadCount)
        } catch (e) {
          return
        }
        const list = notifies.filter(v => {
          const flag = v.group.groupCode + '|' + v.seq + '|' + v.type
          if (groupNotifyFlags.includes(flag)) {
            return false
          }
          groupNotifyFlags.push(flag)
          return true
        })
        this.ctx.parallel('nt/group-notify', list)
      }
    })

    registerReceiveHook<FriendRequestNotify>(ReceiveCmdS.FRIEND_REQUEST, payload => {
      this.ctx.parallel('nt/friend-request', payload.data.buddyReqs)
    })

    invoke('nodeIKernelMsgListener/onRecvSysMsg', [], { classNameIsRegister: true })

    registerReceiveHook<{
      msgBuf: number[]
    }>('nodeIKernelMsgListener/onRecvSysMsg', payload => {
      this.ctx.parallel('nt/system-message-created', Uint8Array.from(payload.msgBuf))
    })
  }
}

namespace Core {
  export interface Config extends LLOBConfig {
  }
}

export default Core
