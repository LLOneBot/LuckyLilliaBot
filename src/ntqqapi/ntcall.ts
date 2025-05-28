import { hookApiCallbacks, registerReceiveHook, removeReceiveHook } from './hook'
import { DetailedError, getBuildVersion, log } from '../common/utils'
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
  NodeIKernelNodeMiscService,
  NodeIKernelRecentContactService,
} from './services'
import { pmhq } from '@/ntqqapi/native/pmhq'

export enum NTClass {
  NT_API = 'ns-ntApi',
  FS_API = 'ns-FsApi',
  OS_API = 'ns-OsApi',
  HOTUPDATE_API = 'ns-HotUpdateApi',
  BUSINESS_API = 'ns-BusinessApi',
  NODE_STORE_API = 'ns-NodeStoreApi',
  QQ_EX_API = 'ns-QQEXApi',
}

const newEventName: Record<NTClass, string> = {
  [NTClass.NT_API]: 'ntApi',
  [NTClass.FS_API]: 'FileApi',
  [NTClass.OS_API]: 'OsApi',
  [NTClass.HOTUPDATE_API]: 'HotUpdateApi',
  [NTClass.BUSINESS_API]: 'BusinessApi',
  [NTClass.NODE_STORE_API]: 'NodeStoreApi',
  [NTClass.QQ_EX_API]: 'QQEXApi'
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
  IPC_UP_4 = 'IPC_UP_4',
  RM_IPC_FROM_RENDERER_2 = 'RM_IPCFROM_RENDERER2',
  RM_IPC_FROM_RENDERER_3 = 'RM_IPCFROM_RENDERER3'
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
  nodeIKernelRecentContactService: NodeIKernelRecentContactService
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
}

export function invoke<
  R extends Awaited<ReturnType<Extract<NTService[S][M], (...args: any) => unknown>>>,
  S extends keyof NTService = any,
  M extends keyof NTService[S] & string = any
>(method: Extract<unknown, `${S}/${M}`> | string, args: unknown[], options: InvokeOptions<R> = {}) {
  const splitMethod = method.split('/');
  const serviceName = splitMethod[0] as keyof NTService;
  const methodName = splitMethod.slice(1).join('/');
  const pmhqService = NT_SERVICE_TO_PMHQ[serviceName] || serviceName;
  const funcName = `wrapperSession.${pmhqService}().${methodName}`;
  return pmhq.call(funcName, args)
}
