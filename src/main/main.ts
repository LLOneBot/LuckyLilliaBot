// 运行在 Electron 主进程 下的插件入口

import { BrowserWindow, dialog, ipcMain } from 'electron'
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
import { DATA_DIR } from '../common/utils'
import {
  getGroupMember,
  llonebotError,
  selfInfo,
} from '../common/data'
import { hookNTQQApiCall, hookNTQQApiReceive, ReceiveCmdS, registerReceiveHook, startHook } from '../ntqqapi/hook'
import { OB11Constructor } from '../onebot11/constructor'
import {
  FriendRequestNotify,
  GroupNotifies,
  GroupNotifyTypes,
  RawMessage,
  BuddyReqType,
} from '../ntqqapi/types'
import { httpHeart, ob11HTTPServer } from '../onebot11/server/http'
import { postOb11Event } from '../onebot11/server/post-ob11-event'
import { ob11ReverseWebsockets } from '../onebot11/server/ws/ReverseWebsocket'
import { OB11GroupRequestEvent } from '../onebot11/event/request/OB11GroupRequest'
import { OB11FriendRequestEvent } from '../onebot11/event/request/OB11FriendRequest'
import path from 'node:path'
import { dbUtil } from '../common/db'
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
import { sleep } from '../common/utils/helper'

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
    llonebotError.ffmpegError = ffmpegOk ? '' : '没有找到ffmpeg,音频只能发送wav和silk,视频尺寸可能异常'
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
      // log('收到新消息', message);
      if (parseInt(message.msgTime) < startTime / 1000) {
        continue
      }
      // log("收到新消息", message.msgId, message.msgSeq)
      // if (message.senderUin !== selfInfo.uin){
      message.msgShortId = await dbUtil.addMsg(message)
      // }

      OB11Constructor.message(message)
        .then((msg) => {
          if (!debug && msg.message.length === 0) {
            return
          }
          const isSelfMsg = msg.user_id.toString() == selfInfo.uin
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
        log(message)
        if (privateEvent) {
          // log("post private event", privateEvent);
          postOb11Event(privateEvent)
        }
      })
      // OB11Constructor.FriendAddEvent(message).then((friendAddEvent) => {
      //   log(message)
      //   if (friendAddEvent) {
      //     // log("post friend add event", friendAddEvent);
      //     postOb11Event(friendAddEvent)
      //   }
      // })
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
        log('message update', message.msgId, message)
        if (message.recallTime != '0') {
          if (recallMsgIds.includes(message.msgId)) {
            continue
          }
          recallMsgIds.push(message.msgId)
          const oriMessage = await dbUtil.getMsgByLongId(message.msgId)
          if (!oriMessage) {
            continue
          }
          oriMessage.recallTime = message.recallTime
          dbUtil.updateMsg(oriMessage).then()
          message.msgShortId = oriMessage.msgShortId
          OB11Constructor.RecallEvent(message).then((recallEvent) => {
            if (recallEvent) {
              log('post recall event', recallEvent)
              postOb11Event(recallEvent)
            }
          })
          // 不让入库覆盖原来消息，不然就获取不到撤回的消息内容了
          continue
        }
        dbUtil.updateMsg(message).then()
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
    registerReceiveHook<{
      doubt: boolean
      oldestUnreadSeq: string
      unreadCount: number
    }>(ReceiveCmdS.UNREAD_GROUP_NOTIFY, async (payload) => {
      if (payload.unreadCount) {
        // log("开始获取群通知详情")
        let notify: GroupNotifies
        try {
          notify = await NTQQGroupApi.getGroupNotifies()
        } catch (e) {
          // log("获取群通知详情失败", e);
          return
        }

        const notifies = notify.notifies.slice(0, payload.unreadCount)
        // log("获取群通知详情完成", notifies, payload);

        for (const notify of notifies) {
          try {
            notify.time = Date.now()
            // const notifyTime = parseInt(notify.seq) / 1000
            // log(`加群通知时间${notifyTime}`, `LLOneBot启动时间${startTime}`);
            // if (notifyTime < startTime) {
            //     continue;
            // }
            let existNotify = await dbUtil.getGroupNotify(notify.seq)
            if (existNotify) {
              continue
            }
            log('收到群通知', notify)
            await dbUtil.addGroupNotify(notify)
            const flag = notify.group.groupCode + '|' + notify.seq + '|' + notify.type
            // let member2: GroupMember;
            // if (notify.user2.uid) {
            //     member2 = await getGroupMember(notify.group.groupCode, null, notify.user2.uid);
            // }
            // 原本的群管变更通知事件处理
            // if (
            //   [GroupNotifyTypes.ADMIN_SET, GroupNotifyTypes.ADMIN_UNSET, GroupNotifyTypes.ADMIN_UNSET_OTHER].includes(
            //     notify.type,
            //   )
            // ) {
            //   const member1 = await getGroupMember(notify.group.groupCode, notify.user1.uid)
            //   log('有管理员变动通知')
            //   refreshGroupMembers(notify.group.groupCode).then()
            //   let groupAdminNoticeEvent = new OB11GroupAdminNoticeEvent()
            //   groupAdminNoticeEvent.group_id = parseInt(notify.group.groupCode)
            //   log('开始获取变动的管理员')
            //   if (member1) {
            //     log('变动管理员获取成功')
            //     groupAdminNoticeEvent.user_id = parseInt(member1.uin)
            //     groupAdminNoticeEvent.sub_type = [
            //       GroupNotifyTypes.ADMIN_UNSET,
            //       GroupNotifyTypes.ADMIN_UNSET_OTHER,
            //     ].includes(notify.type)
            //       ? 'unset'
            //       : 'set'
            //     // member1.role = notify.type == GroupNotifyTypes.ADMIN_SET ? GroupMemberRole.admin : GroupMemberRole.normal;
            //     postOb11Event(groupAdminNoticeEvent, true)
            //   }
            //   else {
            //     log('获取群通知的成员信息失败', notify, getGroup(notify.group.groupCode))
            //   }
            // }
            // else 
            if (notify.type == GroupNotifyTypes.MEMBER_EXIT || notify.type == GroupNotifyTypes.KICK_MEMBER) {
              log('有成员退出通知', notify)
              try {
                const member1 = await NTQQUserApi.getUserDetailInfo(notify.user1.uid)
                let operatorId = member1.uin
                let subType: GroupDecreaseSubType = 'leave'
                if (notify.user2.uid) {
                  // 是被踢的
                  const member2 = await getGroupMember(notify.group.groupCode, notify.user2.uid)
                  operatorId = member2?.uin!
                  subType = 'kick'
                }
                let groupDecreaseEvent = new OB11GroupDecreaseEvent(
                  parseInt(notify.group.groupCode),
                  parseInt(member1.uin),
                  parseInt(operatorId),
                  subType,
                )
                postOb11Event(groupDecreaseEvent, true)
              } catch (e: any) {
                log('获取群通知的成员信息失败', notify, e.stack.toString())
              }
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

  async function start() {
    log('llonebot pid', process.pid)
    const config = getConfigUtil().getConfig()
    if (!config.enableLLOB) {
      log('LLOneBot 开关设置为关闭，不启动LLOneBot')
      return
    }
    llonebotError.otherError = ''
    startTime = Date.now()
    dbUtil.init(selfInfo.uin)
    NTEventDispatch.init({ ListenerMap: wrapperConstructor, WrapperSession: getSession()! })
    log('start activate group member info')
    NTQQGroupApi.activateMemberInfoChange().then().catch(log)
    NTQQGroupApi.activateMemberListChange().then().catch(log)
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

  let getSelfNickCount = 0
  const init = async () => {
    if (!selfInfo.uin) {
      selfInfo.uin = globalThis.authData?.uin
      selfInfo.uid = globalThis.authData?.uid
      selfInfo.nick = selfInfo.uin
    }
    //log('self info', selfInfo, globalThis.authData)
    if (selfInfo.uin) {
      async function getUserNick() {
        try {
          getSelfNickCount++
          const userInfo = await NTQQUserApi.getUserDetailInfo(selfInfo.uid)
          log('self info', userInfo)
          if (userInfo) {
            selfInfo.nick = userInfo.nick
            return
          }
        } catch (e: any) {
          log('get self nickname failed', e.stack)
        }
        if (getSelfNickCount < 10) {
          await sleep(1000)
          return await getUserNick()
        }
      }

      await getUserNick()
      start()
    }
    else {
      setTimeout(init, 1000)
    }
  }
  init()
}

// 创建窗口时触发
function onBrowserWindowCreated(window: BrowserWindow) {
  if (selfInfo.uid) {
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
