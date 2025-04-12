import { unlink } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { Service, Context } from 'cordis'
import { registerReceiveHook, ReceiveCmdS, registerCallHook } from './hook'
import { Config as LLOBConfig } from '../common/types'
import { getBuildVersion, isNumeric } from '../common/utils/misc'
import {
  RawMessage,
  GroupNotify,
  FriendRequestNotify,
  FriendRequest,
  GroupMember,
  BuddyReqType,
  GrayTipElementSubType,
  CategoryFriend,
  SimpleInfo,
  ChatType,
  Peer,
  SendMessageElement,
  ElementType
} from './types'
import { selfInfo } from '../common/globalVars'
import { version } from '../version'
import { invoke, NTMethod } from './ntcall'
import { Crychic } from './native/crychic'
import { Pmhq } from './native/pmhq'

declare module 'cordis' {
  interface Context {
    app: Core
  }
  interface Events {
    'nt/message-created': (input: RawMessage) => void
    'nt/message-deleted': (input: RawMessage) => void
    'nt/message-sent': (input: RawMessage) => void
    'nt/group-notify': (input: { notify: GroupNotify, doubt: boolean }) => void
    'nt/friend-request': (input: FriendRequest) => void
    'nt/group-member-info-updated': (input: { groupCode: string, members: GroupMember[] }) => void
    'nt/system-message-created': (input: Uint8Array) => void
  }
}

class Core extends Service {
  static inject = ['ntMsgApi', 'ntFriendApi', 'ntGroupApi', 'store']
  public startupTime = 0
  public messageReceivedCount = 0
  public messageSentCount = 0
  public lastMessageTime = 0
  public crychic
  public pmhq

  constructor(protected ctx: Context, public config: Core.Config) {
    super(ctx, 'app', true)
    this.crychic = new Crychic(ctx)
    this.pmhq = new Pmhq(ctx, config.packetPort)
  }

  public start() {
    this.startupTime = Math.trunc(Date.now() / 1000)
    this.registerListener()
    this.ctx.logger.info(`LLOneBot/${version}`)
    this.ctx.on('llob/config-updated', input => {
      Object.assign(this.config, input)
    })
  }

  public async sendMessage(
    ctx: Context,
    peer: Peer,
    sendElements: SendMessageElement[],
    deleteAfterSentFiles: string[]
  ) {
    if (peer.chatType === ChatType.Group) {
      const info = await ctx.ntGroupApi.getGroupAllInfo(peer.peerUid)
        .catch(() => undefined)
      const shutUpMeTimestamp = info?.groupAll.shutUpMeTimestamp
      if (shutUpMeTimestamp && shutUpMeTimestamp * 1000 > Date.now()) {
        throw new Error('当前处于被禁言状态')
      }
    }
    if (!sendElements.length) {
      throw new Error('消息体无法解析，请检查是否发送了不支持的消息类型')
    }
    // 计算发送的文件大小
    let totalSize = 0
    for (const fileElement of sendElements) {
      try {
        if (fileElement.elementType === ElementType.Ptt) {
          totalSize += statSync(fileElement.pttElement.filePath!).size
        } else if (fileElement.elementType === ElementType.File) {
          totalSize += statSync(fileElement.fileElement.filePath!).size
        } else if (fileElement.elementType === ElementType.Video) {
          totalSize += statSync(fileElement.videoElement.filePath).size
        } else if (fileElement.elementType === ElementType.Pic) {
          totalSize += statSync(fileElement.picElement.sourcePath!).size
        }
      } catch (e) {
        ctx.logger.warn('文件大小计算失败', e, fileElement)
      }
    }
    const timeout = 10000 + (totalSize / 1024 / 256 * 1000)  // 10s Basic Timeout + PredictTime( For File 512kb/s )
    const returnMsg = await ctx.ntMsgApi.sendMsg(peer, sendElements, timeout)
    if (returnMsg) {
      this.messageSentCount++
      ctx.logger.info('消息发送', peer)
      deleteAfterSentFiles.map(path => unlink(path))
      return returnMsg
    }
  }

  private handleMessage(msgList: RawMessage[]) {
    for (const message of msgList) {
      const msgTime = parseInt(message.msgTime)
      // 过滤启动之前的消息
      if (msgTime < this.startupTime) {
        continue
      }
      if (message.senderUin && message.senderUin !== '0') {
        this.ctx.store.addMsgCache(message)
      }
      this.lastMessageTime = msgTime
      this.messageReceivedCount++
      this.ctx.parallel('nt/message-created', message)
    }

    // 自动清理新消息文件
    if (!this.config.autoDeleteFile) {
      return
    }
    for (const message of msgList) {
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
              unlink(path).then(() => this.ctx.logger.info('删除文件成功', path))
            }
          }
        }, this.config.autoDeleteFileSecond! * 1000)
      }
    }
  }

  private registerListener() {
    registerReceiveHook<{ info: { status: number } }>(ReceiveCmdS.SELF_STATUS, (info) => {
      Object.assign(selfInfo, { online: info.info.status !== 20 })
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

    if (getBuildVersion() < 30851) {
      registerReceiveHook<{
        data?: CategoryFriend[]
        userSimpleInfos?: Map<string, SimpleInfo> //V2
        buddyCategory?: CategoryFriend[] //V2
      }>(ReceiveCmdS.FRIENDS, (payload) => {
        let uids: string[] = []
        if (payload.buddyCategory) {
          uids = payload.buddyCategory.flatMap(item => item.buddyUids)
        } else if (payload.data) {
          uids = payload.data.flatMap(item => item.buddyList.map(e => e.uid))
        }
        for (const uid of uids) {
          this.ctx.ntMsgApi.activateChat({ peerUid: uid, chatType: ChatType.C2C })
        }
        this.ctx.logger.info('好友列表变动', uids.length)
      })

      const activatedPeerUids = new Set<string>()
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
            if (activatedPeerUids.has(contact.id)) continue
            activatedPeerUids.add(contact.id)
            const peer = { peerUid: contact.id, chatType: contact.chatType }
            if (contact.chatType === ChatType.TempC2CFromGroup) {
              this.ctx.ntMsgApi.activateChatAndGetHistory(peer, 2).then(res => {
                for (const msg of res.msgList) {
                  if (Date.now() / 1000 - Number(msg.msgTime) > 3) {
                    continue
                  }
                  if (msg.senderUin && msg.senderUin !== '0') {
                    this.ctx.store.addMsgCache(msg)
                  }
                  this.ctx.parallel('nt/message-created', msg)
                }
              })
            } else {
              this.ctx.ntMsgApi.activateChat(peer)
            }
          }
        }
      })

      registerCallHook(NTMethod.DELETE_ACTIVE_CHAT, async (payload) => {
        const peerUid = payload[0] as string
        this.ctx.logger.info('激活的聊天窗口被删除，准备重新激活', peerUid)
        let chatType = ChatType.C2C
        if (isNumeric(peerUid)) {
          chatType = ChatType.Group
        }
        else if (!(await this.ctx.ntFriendApi.isBuddy(peerUid))) {
          chatType = ChatType.TempC2CFromGroup
        }
        const peer = { peerUid, chatType }
        await this.ctx.sleep(1000)
        this.ctx.ntMsgApi.activateChat(peer).then((r) => {
          this.ctx.logger.info('重新激活聊天窗口', peer, { result: r.result, errMsg: r.errMsg })
        })
      })

      registerReceiveHook<{ msgList: RawMessage[] }>(ReceiveCmdS.NEW_ACTIVE_MSG, payload => {
        this.handleMessage(payload.msgList)
      })
    }

    registerReceiveHook<{ msgList: RawMessage[] }>(ReceiveCmdS.NEW_MSG, payload => {
      this.handleMessage(payload.msgList)
    })

    const sentMsgIds = new Map<string, boolean>()
    const recallMsgIds: string[] = [] // 避免重复上报

    registerReceiveHook<{ msgList: RawMessage[] }>([ReceiveCmdS.UPDATE_MSG], payload => {
      for (const msg of payload.msgList) {
        if (
          msg.recallTime !== '0' &&
          msg.msgType === 5 &&
          msg.subMsgType === 4 &&
          msg.elements[0]?.grayTipElement?.subElementType === GrayTipElementSubType.Revoke &&
          !recallMsgIds.includes(msg.msgId)
        ) {
          recallMsgIds.shift()
          recallMsgIds.push(msg.msgId)
          this.ctx.parallel('nt/message-deleted', msg)
        } else if (sentMsgIds.get(msg.msgId)) {
          if (msg.sendStatus === 2) {
            sentMsgIds.delete(msg.msgId)
            this.ctx.parallel('nt/message-sent', msg)
          }
        }
      }
    })

    registerReceiveHook<{ msgRecord: RawMessage }>(ReceiveCmdS.SELF_SEND_MSG, payload => {
      sentMsgIds.set(payload.msgRecord.msgId, true)
    })

    const groupNotifyIgnore: string[] = []
    registerReceiveHook<{
      doubt: boolean
      oldestUnreadSeq: string
      unreadCount: number
    }>(ReceiveCmdS.UNREAD_GROUP_NOTIFY, async (payload) => {
      if (payload.unreadCount) {
        let notifies: GroupNotify[]
        try {
          notifies = await this.ctx.ntGroupApi.getSingleScreenNotifies(payload.doubt, payload.unreadCount)
        } catch (e) {
          return
        }
        for (const notify of notifies) {
          const notifyTime = Math.trunc(+notify.seq / 1000 / 1000)
          if (groupNotifyIgnore.includes(notify.seq) || notifyTime < this.startupTime) {
            continue
          }
          groupNotifyIgnore.push(notify.seq)
          this.ctx.parallel('nt/group-notify', { notify, doubt: payload.doubt })
        }
      }
    })

    registerReceiveHook<FriendRequestNotify>(ReceiveCmdS.FRIEND_REQUEST, payload => {
      for (const req of payload.data.buddyReqs) {
        if (!!req.isInitiator || (req.isDecide && req.reqType !== BuddyReqType.MeInitiatorWaitPeerConfirm)) {
          continue
        }
        if (+req.reqTime < this.startupTime) {
          continue
        }
        this.ctx.parallel('nt/friend-request', req)
      }
    })

    invoke('nodeIKernelMsgListener/onRecvSysMsg', [], { registerEvent: true })
      .catch(async () => {
        await this.ctx.sleep(600)
        invoke('nodeIKernelMsgListener/onRecvSysMsg', [], { registerEvent: true })
      })

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
