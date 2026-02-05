import { inspect } from 'node:util'
import { ReceiveCmdS, registerReceiveHook, removeReceiveHook } from './hook'
import type { InferPayloadFromMethod } from './hook'
import {
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
  NodeIKernelNodeMiscService,
  NodeIKernelRecentContactService,
} from './services'
import { pmhq } from '@/ntqqapi/native/pmhq'
import { NodeIKernelFlashTransferService } from '@/ntqqapi/services/NodeIKernelFlashTransferService'
import { NodeIKernelLoginService } from '@/ntqqapi/services/NodeIKernelLoginService'
import { DetailedError } from '@/common/utils'
import { NodeIKernelAlbumService } from '@/ntqqapi/services/NodeIKernelAlbumService'

export enum NTMethod {
  ACTIVE_CHAT_PREVIEW = 'nodeIKernelMsgService/getAioFirstViewLatestMsgsAndAddActiveChat', // 激活聊天窗口，有时候必须这样才能收到消息, 并返回最新预览消息
  ACTIVE_CHAT_HISTORY = 'nodeIKernelMsgService/getMsgsIncludeSelfAndAddActiveChat', // 激活聊天窗口，有时候必须这样才能收到消息, 并返回历史消息
  HISTORY_MSG = 'nodeIKernelMsgService/getMsgsIncludeSelf',
  GET_MULTI_MSG = 'nodeIKernelMsgService/getMultiMsg',
  DELETE_ACTIVE_CHAT = 'nodeIKernelMsgService/deleteActiveChatByUid',
  MEDIA_FILE_PATH = 'nodeIKernelMsgService/getRichMediaFilePathForGuild',
  RECALL_MSG = 'nodeIKernelMsgService/recallMsg',
  EMOJI_LIKE = 'nodeIKernelMsgService/setMsgEmojiLikes',

  GROUP_MEMBER_SCENE = 'nodeIKernelGroupService/createMemberListScene',
  GROUP_MEMBERS = 'nodeIKernelGroupService/getAllMemberList',
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


interface NTService {
  nodeIKernelLoginService: NodeIKernelLoginService
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
  nodeIKernelRecentContactService: NodeIKernelRecentContactService
  nodeIKernelFlashTransferService: NodeIKernelFlashTransferService
  nodeIKernelAlbumService: NodeIKernelAlbumService
}

interface InvokeOptions<ReturnType> {
  resultCmd?: ReceiveCmdS | string // 表示这次call是异步的，返回结果会通过这个命令上报
  resultCb?: (data: ReturnType, firstResult: any) => boolean // 结果回调，直到返回true才会移除钩子
  timeout?: number
}

const NT_SERVICE_TO_PMHQ: Record<string, string> = {
  'nodeIKernelBuddyService': 'getBuddyService',
  'nodeIKernelProfileService': 'getProfileService',
  'nodeIKernelGroupService': 'getGroupService',
  'nodeIKernelProfileLikeService': 'getProfileLikeService',
  'nodeIKernelMsgService': 'getMsgService',
  'nodeIKernelMSFService': 'getMSFService',
  'nodeIKernelUixConvertService': 'getUixConvertService',
  'nodeIKernelRichMediaService': 'getRichMediaService',
  'nodeIKernelTicketService': 'getTicketService',
  'nodeIKernelTipOffService': 'getTipOffService',
  'nodeIKernelRobotService': 'getRobotService',
  'nodeIKernelNodeMiscService': 'getNodeMiscService',
  'nodeIKernelRecentContactService': 'getRecentContactService',
  'nodeIKernelFlashTransferService': 'getFlashTransferService',
  'nodeIKernelLoginService': 'loginService',
  'nodeIKernelAlbumService': 'getAlbumService',
}
const NOT_SESSION_SERVICES = ['nodeIKernelLoginService']

// 函数重载：当提供resultCmd时，自动从resultCmd推断返回类型
export function invoke<
  ResultCmd extends string,
  R extends InferPayloadFromMethod<ResultCmd>,
  S extends keyof NTService = any,
  M extends keyof NTService[S] & string = any,
  P extends Parameters<Extract<NTService[S][M], (...args: any) => unknown>> = any
>(
  method: Extract<unknown, `${S}/${M}`> | string,
  args: P,
  options: InvokeOptions<R> & { resultCmd: ResultCmd }
): Promise<R>

// 函数重载：当不提供resultCmd时，使用原来的类型推断
export function invoke<
  R extends Awaited<ReturnType<Extract<NTService[S][M], (...args: any) => unknown>>>,
  S extends keyof NTService = any,
  M extends keyof NTService[S] & string = any,
  P extends Parameters<Extract<NTService[S][M], (...args: any) => unknown>> = any
>(
  method: Extract<unknown, `${S}/${M}`> | string,
  args: P,
  options?: InvokeOptions<R>
): Promise<R>

// 实际实现
export function invoke<
  R = any,
  S extends keyof NTService = any,
  M extends keyof NTService[S] & string = any,
  P extends Parameters<Extract<NTService[S][M], (...args: any) => unknown>> = any
>(method: Extract<unknown, `${S}/${M}`> | string, args: P, options: InvokeOptions<R> = {}): Promise<R> {
  const splitMethod = method.split('/')
  const serviceName = splitMethod[0] as keyof NTService
  const methodName = splitMethod.slice(1).join('/')
  const pmhqService = NT_SERVICE_TO_PMHQ[serviceName]
  let funcName = ''
  if (pmhqService) {
    if (NOT_SESSION_SERVICES.includes(serviceName))
      funcName = `${pmhqService}.${methodName}`
    else {
      funcName = `wrapperSession.${pmhqService}().${methodName}`
    }
  }
  else {
    funcName = method
  }
  let timeout = options.timeout ?? 15000

  return new Promise<R>((resolve, reject) => {
    let timeoutId = null
    let hookId: string = ''
    if (timeout) {
      timeoutId = setTimeout(() => {
        removeReceiveHook(hookId)
        const display = inspect(args, {
          depth: 10,
          compact: true,
          breakLength: Infinity,
          maxArrayLength: 220
        })
        reject(new Error(`invoke timeout, ${funcName}, ${display}`))
      }, timeout)
    }
    if (options.resultCmd) {
      let firstResult: any = undefined
      hookId = registerReceiveHook<R>(options.resultCmd as string, (data: R) => {
        if (options.resultCb && !options.resultCb(data, firstResult)) {
          return
        }
        resolve(data)
        removeReceiveHook(hookId)
        timeoutId && clearTimeout(timeoutId)
      })
      pmhq.call(funcName, args, timeout).then(r => {
        firstResult = r
        if (r && Object.hasOwn(r, 'result') && +r.result !== 0) {
          const displayReq = inspect(args, {
            depth: 10,
            compact: true,
            breakLength: Infinity,
            maxArrayLength: 220
          })
          const displayRes = inspect(r, {
            depth: 10,
            compact: true,
            breakLength: Infinity,
            maxArrayLength: 220
          })
          reject(new DetailedError(`invoke failed, ${funcName}, ${displayReq}, ${displayRes}`, r))
          removeReceiveHook(hookId)
          timeoutId && clearTimeout(timeoutId)
        }
      }).catch(reject)
    }
    else {
      pmhq.call(funcName, args, timeout).then(r => {
        resolve(r)
        timeoutId && clearTimeout(timeoutId)
      }).catch(reject)
    }
  })
}
