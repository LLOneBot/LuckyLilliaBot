// 运行在 Electron 主进程 下的插件入口

import { BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Config } from '../common/types'
import {
  CHANNEL_CHECK_VERSION,
  CHANNEL_ERROR,
  CHANNEL_GET_CONFIG,
  CHANNEL_LOG,
  CHANNEL_SELECT_FILE,
  CHANNEL_SET_CONFIG,
  CHANNEL_UPDATE,
} from '../common/channels'
import { ob11WebsocketServer } from '../onebot11/server/ws/WebsocketServer'
import { DATA_DIR, TEMP_DIR } from '../common/utils'
import {
  llonebotError,
  setSelfInfo,
  getSelfInfo,
  getSelfUid,
  getSelfUin,
  addMsgCache
} from '../common/data'
import { hookNTQQApiCall, hookNTQQApiReceive, ReceiveCmdS, registerReceiveHook, startHook } from '../ntqqapi/hook'
import { OB11Constructor } from '../onebot11/constructor'
import {
  FriendRequestNotify,
  GroupNotify,
  GroupNotifyTypes,
  RawMessage,
  BuddyReqType,
} from '../ntqqapi/types'
import { httpHeart, ob11HTTPServer } from '../onebot11/server/http'
import { postOb11Event } from '../onebot11/server/post-ob11-event'
import { ob11ReverseWebsockets } from '../onebot11/server/ws/ReverseWebsocket'
import { OB11GroupRequestEvent } from '../onebot11/event/request/OB11GroupRequest'
import { OB11FriendRequestEvent } from '../onebot11/event/request/OB11FriendRequest'
import { MessageUnique } from '../common/utils/MessageUnique'
import { setConfig } from './setConfig'
import { NTQQUserApi, NTQQGroupApi } from '../ntqqapi/api'
import { checkNewVersion, upgradeLLOneBot } from '../common/utils/upgrade'
import { log } from '../common/utils/log'
import { getConfigUtil } from '../common/config'
import { checkFfmpeg } from '../common/utils/video'
import { GroupDecreaseSubType, OB11GroupDecreaseEvent } from '../onebot11/event/notice/OB11GroupDecreaseEvent'
import '../ntqqapi/wrapper'
import { NTEventDispatch } from '../common/utils/EventTask'
import { wrapperConstructor, getSession } from '../ntqqapi/wrapper'
import { Peer } from '../ntqqapi/types'

let mainWindow: BrowserWindow | null = null

// 加载插件时触发
function onLoad() {
  ipcMain.handle(CHANNEL_CHECK_VERSION, async (event, arg) => {
    return checkNewVersion()
  })
  ipcMain.handle(CHANNEL_UPDATE, async (event, arg) => {
    return upgradeLLOneBot()
  })
  ipcMain.handle(CHANNEL_SELECT_FILE, async (event, arg) => {
    const selectPath = new Promise<string>((resolve, reject) => {
      dialog
        .showOpenDialog({
          title: '请选择ffmpeg',
          properties: ['openFile'],
          buttonLabel: '确定',
        })
        .then((result) => {
          log('选择文件', result)
          if (!result.canceled) {
            const _selectPath = path.join(result.filePaths[0])
            resolve(_selectPath)
            // let config = getConfigUtil().getConfig()
            // config.ffmpeg = path.join(result.filePaths[0]);
            // getConfigUtil().setConfig(config);
          }
          resolve('')
        })
        .catch((err) => {
          reject(err)
        })
    })
    try {
      return await selectPath
    } catch (e) {
      log('选择文件出错', e)
      return ''
    }
  })
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  ipcMain.handle(CHANNEL_ERROR, async (event, arg) => {
    const ffmpegOk = await checkFfmpeg(getConfigUtil().getConfig().ffmpeg)
    llonebotError.ffmpegError = ffmpegOk ? '' : '没有找到 FFmpeg, 音频只能发送 WAV 和 SILK, 视频尺寸可能异常'
    let { httpServerError, wsServerError, otherError, ffmpegError } = llonebotError
    let error = `${otherError}\n${httpServerError}\n${wsServerError}\n${ffmpegError}`
    error = error.replace('\n\n', '\n')
    error = error.trim()
    log('查询llonebot错误信息', error)
    return error
  })
  ipcMain.handle(CHANNEL_GET_CONFIG, async (event, arg) => {
    const config = getConfigUtil().getConfig()
    return config
  })
  ipcMain.on(CHANNEL_SET_CONFIG, (event, ask: boolean, config: Config) => {
    if (!ask) {
      setConfig(config)
        .then()
        .catch((e) => {
          log('保存设置失败', e.stack)
        })
      return
    }
    dialog
      .showMessageBox(mainWindow!, {
        type: 'question',
        buttons: ['确认', '取消'],
        defaultId: 0, // 默认选中的按钮，0 代表第一个按钮，即 "确认"
        title: '确认保存',
        message: '是否保存？',
        detail: 'LLOneBot配置已更改，是否保存？',
      })
      .then((result) => {
        if (result.response === 0) {
          setConfig(config)
            .then()
            .catch((e) => {
              log('保存设置失败', e.stack)
            })
        }
        else {
        }
      })
      .catch((err) => {
        log('保存设置询问弹窗错误', err)
      })
  })

  ipcMain.on(CHANNEL_LOG, (event, arg) => {
    log(arg)
  })

  async function postReceiveMsg(msgList: RawMessage[]) {
    const { debug, reportSelfMessage } = getConfigUtil().getConfig()
    for (let message of msgList) {
      // 过滤启动之前的消息
      if (parseInt(message.msgTime) < startTime / 1000) {
        continue
      }
      // log("收到新消息", message.msgId, message.msgSeq)
      const peer: Peer = {
        chatType: message.chatType,
        peerUid: message.peerUid
      }
      message.msgShortId = MessageUnique.createMsg(peer, message.msgId)
      addMsgCache(message)

      OB11Constructor.message(message)
        .then((msg) => {
          if (!debug && msg.message.length === 0) {
            return
          }
          const isSelfMsg = msg.user_id.toString() === getSelfUin()
          if (isSelfMsg && !reportSelfMessage) {
            return
          }
          if (isSelfMsg) {
            msg.target_id = parseInt(message.peerUin)
          }
          postOb11Event(msg)
          // log("post msg", msg)
        })
        .catch((e) => log('constructMessage error: ', e.stack.toString()))
      OB11Constructor.GroupEvent(message).then((groupEvent) => {
        if (groupEvent) {
          // log("post group event", groupEvent);
          postOb11Event(groupEvent)
        }
      })
      OB11Constructor.PrivateEvent(message).then((privateEvent) => {
        //log(message)
        if (privateEvent) {
          // log("post private event", privateEvent);
          postOb11Event(privateEvent)
        }
      })
    }
  }

  async function startReceiveHook() {
    startHook()
    registerReceiveHook<{
      msgList: Array<RawMessage>
    }>([ReceiveCmdS.NEW_MSG, ReceiveCmdS.NEW_ACTIVE_MSG], async (payload) => {
      try {
        await postReceiveMsg(payload.msgList)
      } catch (e: any) {
        log('report message error: ', e.stack.toString())
      }
    })
    const recallMsgIds: string[] = [] // 避免重复上报
    registerReceiveHook<{ msgList: Array<RawMessage> }>([ReceiveCmdS.UPDATE_MSG], async (payload) => {
      for (const message of payload.msgList) {
        if (message.recallTime != '0') {
          if (recallMsgIds.includes(message.msgId)) {
            continue
          }
          recallMsgIds.push(message.msgId)
          const oriMessageId = MessageUnique.getShortIdByMsgId(message.msgId)
          if (!oriMessageId) {
            continue
          }
          OB11Constructor.RecallEvent(message, oriMessageId).then((recallEvent) => {
            if (recallEvent) {
              //log('post recall event', recallEvent)
              postOb11Event(recallEvent)
            }
          })
        }
      }
    })
    registerReceiveHook<{ msgRecord: RawMessage }>(ReceiveCmdS.SELF_SEND_MSG, async (payload) => {
      const { reportSelfMessage } = getConfigUtil().getConfig()
      if (!reportSelfMessage) {
        return
      }
      // log("reportSelfMessage", payload)
      try {
        await postReceiveMsg([payload.msgRecord])
      } catch (e: any) {
        log('report self message error: ', e.stack.toString())
      }
    })
    const processedGroupNotify: string[] = []
    registerReceiveHook<{
      doubt: boolean
      oldestUnreadSeq: string
      unreadCount: number
    }>(ReceiveCmdS.UNREAD_GROUP_NOTIFY, async (payload) => {
      if (payload.unreadCount) {
        // log("开始获取群通知详情")
        let notifies: GroupNotify[]
        try {
          notifies = (await NTQQGroupApi.getSingleScreenNotifies(14)).slice(0, payload.unreadCount)
        } catch (e) {
          // log("获取群通知详情失败", e);
          return
        }

        for (const notify of notifies) {
          try {
            notify.time = Date.now()
            const notifyTime = parseInt(notify.seq) / 1000
            const flag = notify.group.groupCode + '|' + notify.seq + '|' + notify.type
            if (notifyTime < startTime || processedGroupNotify.includes(flag)) {
              continue
            }
            processedGroupNotify.push(flag)
            if (notify.type == GroupNotifyTypes.MEMBER_EXIT || notify.type == GroupNotifyTypes.KICK_MEMBER) {
              log('有成员退出通知', notify)
              const member1Uin = (await NTQQUserApi.getUinByUid(notify.user1.uid))!
              let operatorId = member1Uin
              let subType: GroupDecreaseSubType = 'leave'
              if (notify.user2.uid) {
                // 是被踢的
                const member2Uin = await NTQQUserApi.getUinByUid(notify.user2.uid)
                if (member2Uin) {
                  operatorId = member2Uin
                }
                subType = 'kick'
              }
              const groupDecreaseEvent = new OB11GroupDecreaseEvent(
                parseInt(notify.group.groupCode),
                parseInt(member1Uin),
                parseInt(operatorId),
                subType,
              )
              postOb11Event(groupDecreaseEvent, true)
            }
            else if ([GroupNotifyTypes.JOIN_REQUEST, GroupNotifyTypes.JOIN_REQUEST_BY_INVITED].includes(notify.type)) {
              log('有加群请求')
              let requestQQ = ''
              try {
                // uid-->uin
                requestQQ = (await NTQQUserApi.getUinByUid(notify.user1.uid))
                if (isNaN(parseInt(requestQQ))) {
                  requestQQ = (await NTQQUserApi.getUserDetailInfo(notify.user1.uid)).uin
                }
              } catch (e) {
                log('获取加群人QQ号失败 Uid:', notify.user1.uid, e)
              }
              let invitorId: string
              if (notify.type == GroupNotifyTypes.JOIN_REQUEST_BY_INVITED) {
                // groupRequestEvent.sub_type = 'invite'
                try {
                  // uid-->uin
                  invitorId = (await NTQQUserApi.getUinByUid(notify.user2.uid))
                  if (isNaN(parseInt(invitorId))) {
                    invitorId = (await NTQQUserApi.getUserDetailInfo(notify.user2.uid)).uin
                  }
                } catch (e) {
                  invitorId = ''
                  log('获取邀请人QQ号失败 Uid:', notify.user2.uid, e)
                }
              }
              const groupRequestEvent = new OB11GroupRequestEvent(
                parseInt(notify.group.groupCode),
                parseInt(requestQQ) || 0,
                flag,
                notify.postscript,
                invitorId! === undefined ? undefined : +invitorId,
                'add'
              )
              postOb11Event(groupRequestEvent)
            }
            else if (notify.type == GroupNotifyTypes.INVITE_ME) {
              log('收到邀请我加群通知')
              const userId = (await NTQQUserApi.getUinByUid(notify.user2.uid)) || ''
              const groupInviteEvent = new OB11GroupRequestEvent(
                parseInt(notify.group.groupCode),
                parseInt(userId),
                flag,
                undefined,
                undefined,
                'invite'
              )
              postOb11Event(groupInviteEvent)
            }
          } catch (e: any) {
            log('解析群通知失败', e.stack.toString())
          }
        }
      }
      else if (payload.doubt) {
        // 可能有群管理员变动
      }
    })

    registerReceiveHook<FriendRequestNotify>(ReceiveCmdS.FRIEND_REQUEST, async (payload) => {
      for (const req of payload.data.buddyReqs) {
        if (!!req.isInitiator || (req.isDecide && req.reqType !== BuddyReqType.KMEINITIATORWAITPEERCONFIRM)) {
          continue
        }
        let userId = 0
        try {
          const requesterUin = await NTQQUserApi.getUinByUid(req.friendUid)
          userId = parseInt(requesterUin!)
        } catch (e) {
          log('获取加好友者QQ号失败', e)
        }
        const flag = req.friendUid + '|' + req.reqTime
        const comment = req.extWords
        const friendRequestEvent = new OB11FriendRequestEvent(
          userId,
          comment,
          flag
        )
        postOb11Event(friendRequestEvent)
      }
    })
  }

  let startTime = 0 // 毫秒

  async function start(uid: string, uin: string) {
    log('process pid', process.pid)
    const config = getConfigUtil().getConfig()
    if (!config.enableLLOB) {
      llonebotError.otherError = 'LLOneBot 未启动'
      log('LLOneBot 开关设置为关闭，不启动LLOneBot')
      return
    }
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true })
    }
    llonebotError.otherError = ''
    startTime = Date.now()
    NTEventDispatch.init({ ListenerMap: wrapperConstructor, WrapperSession: getSession()! })
    MessageUnique.init(uin)

    //log('start activate group member info')
    // 下面两个会导致CPU占用过高，QQ卡死
    // NTQQGroupApi.activateMemberInfoChange().then().catch(log)
    // NTQQGroupApi.activateMemberListChange().then().catch(log)
    startReceiveHook().then()

    if (config.ob11.enableHttp) {
      ob11HTTPServer.start(config.ob11.httpPort)
    }
    if (config.ob11.enableWs) {
      ob11WebsocketServer.start(config.ob11.wsPort)
    }
    if (config.ob11.enableWsReverse) {
      ob11ReverseWebsockets.start()
    }
    if (config.ob11.enableHttpHeart) {
      httpHeart.start()
    }

    log('LLOneBot start')
  }

  const intervalId = setInterval(() => {
    const current = getSelfInfo()
    if (!current.uin) {
      setSelfInfo({
        uin: globalThis.authData?.uin,
        uid: globalThis.authData?.uid,
        nick: current.uin,
      })
    }
    if (current.uin && getSession()) {
      clearInterval(intervalId)
      start(current.uid, current.uin)
    }
  }, 600)
}

// 创建窗口时触发
function onBrowserWindowCreated(window: BrowserWindow) {
  if (window.id !== 2) {
    return
  }
  mainWindow = window
  log('window create', window.webContents.getURL().toString())
  try {
    hookNTQQApiCall(window)
    hookNTQQApiReceive(window)
  } catch (e: any) {
    log('LLOneBot hook error: ', e.toString())
  }
}

try {
  onLoad()
} catch (e: any) {
  console.log(e.toString())
}

// 这两个函数都是可选的
export { onBrowserWindowCreated }
