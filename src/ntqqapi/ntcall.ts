import { ipcMain } from 'electron'
import { hookApiCallbacks, ReceiveCmdS, registerReceiveHook, removeReceiveHook } from './hook'
import { getBuildVersion, log } from '../common/utils'
import { randomUUID } from 'node:crypto'
import {
  GeneralCallResult,
  NodeIKernelBuddyService,
  NodeIKernelProfileService,
  NodeIKernelGroupService,
  NodeIKernelProfileLikeService,
  NodeIKernelMsgService,
  NodeIKernelMSFService,
  NodeIKernelUixConvertService,
  NodeIKernelRichMediaService,
  NodeIKernelTicketService,
  NodeIKernelTipOffService,
  NodeIKernelRobotService,
  NodeIKernelNodeMiscService
} from './services'
import { CategoryFriend, SimpleInfo, UserDetailInfoByUin } from '@/ntqqapi/types'
import { selfInfo } from '@/common/globalVars'

export enum NTClass {
  NT_API = 'ns-ntApi',
  FS_API = 'ns-FsApi',
  OS_API = 'ns-OsApi',
  WINDOW_API = 'ns-WindowApi',
  HOTUPDATE_API = 'ns-HotUpdateApi',
  BUSINESS_API = 'ns-BusinessApi',
  GLOBAL_DATA = 'ns-GlobalDataApi',
  SKEY_API = 'ns-SkeyApi',
  GROUP_HOME_WORK = 'ns-GroupHomeWork',
  GROUP_ESSENCE = 'ns-GroupEssence',
  NODE_STORE_API = 'ns-NodeStoreApi'
}

export enum NTMethod {
  ACTIVE_CHAT_PREVIEW = 'nodeIKernelMsgService/getAioFirstViewLatestMsgsAndAddActiveChat', // 激活聊天窗口，有时候必须这样才能收到消息, 并返回最新预览消息
  ACTIVE_CHAT_HISTORY = 'nodeIKernelMsgService/getMsgsIncludeSelfAndAddActiveChat', // 激活聊天窗口，有时候必须这样才能收到消息, 并返回历史消息
  HISTORY_MSG = 'nodeIKernelMsgService/getMsgsIncludeSelf',
  GET_MULTI_MSG = 'nodeIKernelMsgService/getMultiMsg',
  DELETE_ACTIVE_CHAT = 'nodeIKernelMsgService/deleteActiveChatByUid',
  MEDIA_FILE_PATH = 'nodeIKernelMsgService/getRichMediaFilePathForGuild',
  RECALL_MSG = 'nodeIKernelMsgService/recallMsg',
  EMOJI_LIKE = 'nodeIKernelMsgService/setMsgEmojiLikes',

  SELF_INFO = 'fetchAuthData',
  FILE_TYPE = 'getFileType',
  FILE_MD5 = 'getFileMd5',
  FILE_COPY = 'copyFile',
  IMAGE_SIZE = 'getImageSizeFromPath',
  FILE_SIZE = 'getFileSize',
  CACHE_PATH_HOT_UPDATE = 'getHotUpdateCachePath',
  CACHE_PATH_DESKTOP_TEMP = 'getDesktopTmpPath',
  CACHE_PATH_SESSION = 'getCleanableAppSessionPathList',
  OPEN_EXTRA_WINDOW = 'openExternalWindow',

  GROUP_MEMBER_SCENE = 'nodeIKernelGroupService/createMemberListScene',
  GROUP_MEMBERS = 'nodeIKernelGroupService/getNextMemberList',
  HANDLE_GROUP_REQUEST = 'nodeIKernelGroupService/operateSysNotify',
  QUIT_GROUP = 'nodeIKernelGroupService/quitGroup',
  GROUP_AT_ALL_REMAIN_COUNT = 'nodeIKernelGroupService/getGroupRemainAtTimes',
  KICK_MEMBER = 'nodeIKernelGroupService/kickMember',
  MUTE_MEMBER = 'nodeIKernelGroupService/setMemberShutUp',
  MUTE_GROUP = 'nodeIKernelGroupService/setGroupShutUp',
  SET_MEMBER_CARD = 'nodeIKernelGroupService/modifyMemberCardName',
  SET_MEMBER_ROLE = 'nodeIKernelGroupService/modifyMemberRole',
  SET_GROUP_NAME = 'nodeIKernelGroupService/modifyGroupName',

  HANDLE_FRIEND_REQUEST = 'nodeIKernelBuddyService/approvalFriendRequest',

  CACHE_SET_SILENCE = 'nodeIKernelStorageCleanService/setSilentScan',
  CACHE_ADD_SCANNED_PATH = 'nodeIKernelStorageCleanService/addCacheScanedPaths',
  CACHE_SCAN = 'nodeIKernelStorageCleanService/scanCache',
  CACHE_CLEAR = 'nodeIKernelStorageCleanService/clearCacheDataByKeys',
  CACHE_CHAT_GET = 'nodeIKernelStorageCleanService/getChatCacheInfo',
  CACHE_FILE_GET = 'nodeIKernelStorageCleanService/getFileCacheInfo',
  CACHE_CHAT_CLEAR = 'nodeIKernelStorageCleanService/clearChatCacheInfo',
}

export enum NTChannel {
  IPC_UP_1 = 'IPC_UP_1',
  IPC_UP_2 = 'IPC_UP_2',
  IPC_UP_3 = 'IPC_UP_3',
  IPC_UP_4 = 'IPC_UP_4'
}

interface NTService {
  nodeIKernelBuddyService: NodeIKernelBuddyService
  nodeIKernelProfileService: NodeIKernelProfileService
  nodeIKernelGroupService: NodeIKernelGroupService
  nodeIKernelProfileLikeService: NodeIKernelProfileLikeService
  nodeIKernelMsgService: NodeIKernelMsgService
  nodeIKernelMSFService: NodeIKernelMSFService
  nodeIKernelUixConvertService: NodeIKernelUixConvertService
  nodeIKernelRichMediaService: NodeIKernelRichMediaService
  nodeIKernelTicketService: NodeIKernelTicketService
  nodeIKernelTipOffService: NodeIKernelTipOffService
  nodeIKernelRobotService: NodeIKernelRobotService
  nodeIKernelNodeMiscService: NodeIKernelNodeMiscService
}

interface InvokeOptions<ReturnType> {
  className?: NTClass
  channel?: NTChannel
  registerEvent?: boolean
  cbCmd?: string | string[]
  cmdCB?: (payload: ReturnType, result: unknown) => boolean
  afterFirstCmd?: boolean // 是否在methodName调用完之后再去hook cbCmd
  timeout?: number
}

let availableChannel: NTChannel | undefined = undefined;

export async function checkChanelId(){
  async function testChannel(channel: NTChannel) {
    await invoke<UserDetailInfoByUin>(
      'nodeIKernelProfileService/getUserDetailInfoByUin',
      [{ uin: selfInfo.uin }],
      { timeout: 1000, channel }
    )
  }

  for (const channel of [NTChannel.IPC_UP_2, NTChannel.IPC_UP_3]) {
    // const channel = `IPC_UP_${windowId}` as NTChannel
    try {
      await testChannel(channel)
      log(`check channel ${channel} success`)
      availableChannel = channel
      return
    } catch (e) {
      log(`check channel ${channel} failed`, e)
    }
  }
  availableChannel = getBuildVersion() >= 28788 ? NTChannel.IPC_UP_3 : NTChannel.IPC_UP_2
}
export function invoke<
  R extends Awaited<ReturnType<Extract<NTService[S][M], (...args: any) => unknown>>>,
  S extends keyof NTService = any,
  M extends keyof NTService[S] & string = any
>(method: Extract<unknown, `${S}/${M}`> | string, args: unknown[], options: InvokeOptions<R> = {}) {
  const className = options.className ?? NTClass.NT_API
  // const channel = options.channel ?? getBuildVersion() >= 28788 ? NTChannel.IPC_UP_3 : NTChannel.IPC_UP_2
  const channel = options.channel ?? availableChannel!
  const timeout = options.timeout ?? 5000
  const afterFirstCmd = options.afterFirstCmd ?? true
  let eventName = className + '-' + channel[channel.length - 1]
  if (options.registerEvent) {
    eventName += '-register'
  }
  return new Promise<R>((resolve, reject) => {
    const apiArgs = [method, ...args]
    const callbackId = randomUUID()
    let eventId: string

    const timeoutId = setTimeout(() => {
      if (eventId) {
        removeReceiveHook(eventId)
      }
      log(`ntqq api timeout ${channel}, ${eventName}, ${method}`, args)
      reject(`ntqq api timeout ${channel}, ${eventName}, ${method}, ${JSON.stringify(args)}`)
    }, timeout)

    if (!options.cbCmd) {
      // QQ后端会返回结果，并且可以根据uuid识别
      hookApiCallbacks[callbackId] = res => {
        clearTimeout(timeoutId)
        resolve(res)
      }
    }
    else {
      let result: unknown
      // 这里的callback比较特殊，QQ后端先返回是否调用成功，再返回一条结果数据
      const secondCallback = () => {
        eventId = registerReceiveHook<R>(options.cbCmd!, (payload) => {
          if (options.cmdCB) {
            if (!options.cmdCB(payload, result)) {
              return
            }
          }
          removeReceiveHook(eventId)
          clearTimeout(timeoutId)
          resolve(payload)
        })
      }
      !afterFirstCmd && secondCallback()
      hookApiCallbacks[callbackId] = (res: GeneralCallResult) => {
        result = res
        if (res?.result === 0 || ['undefined', 'number'].includes(typeof res)) {
          afterFirstCmd && secondCallback()
        }
        else {
          clearTimeout(timeoutId)
          if (eventId) {
            removeReceiveHook(eventId)
          }
          log('ntqq api call failed,', method, args, res)
          reject(`ntqq api call failed, ${method}, ${JSON.stringify(res)}`)
        }
      }
    }

    ipcMain.emit(
      channel,
      {
        sender: {
          send: () => {
          },
        },
      },
      { type: 'request', callbackId, eventName },
      apiArgs,
    )
  })
}
