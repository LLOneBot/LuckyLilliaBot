import { GroupMemberRole } from './group'
import { GeneralCallResult } from '../services'

export interface GetFileListParam {
  sortType: number
  fileCount: number
  startIndex: number
  sortOrder: number
  showOnlinedocFolder: number
  folderId?: string
}

export enum ElementType {
  UNKNOWN = 0,
  TEXT = 1,
  PIC = 2,
  FILE = 3,
  PTT = 4,
  VIDEO = 5,
  FACE = 6,
  REPLY = 7,
  WALLET = 9,
  GreyTip = 8, //Poke别叫戳一搓了 官方名字拍一拍 戳一戳是另一个名字
  ARK = 10,
  MFACE = 11,
  LIVEGIFT = 12,
  STRUCTLONGMSG = 13,
  MARKDOWN = 14,
  GIPHY = 15,
  MULTIFORWARD = 16,
  INLINEKEYBOARD = 17,
  INTEXTGIFT = 18,
  CALENDAR = 19,
  YOLOGAMERESULT = 20,
  AVRECORD = 21,
  FEED = 22,
  TOFURECORD = 23,
  ACEBUBBLE = 24,
  ACTIVITY = 25,
  TOFU = 26,
  FACEBUBBLE = 27,
  SHARELOCATION = 28,
  TASKTOPMSG = 29,
  RECOMMENDEDMSG = 43,
  ACTIONBAR = 44
}

export interface SendTextElement {
  elementType: ElementType.TEXT
  elementId: ''
  textElement: TextElement
}

export interface SendPttElement {
  elementType: ElementType.PTT
  elementId: ''
  pttElement: {
    fileName: string
    filePath: string
    md5HexStr: string
    fileSize: number
    duration: number // 单位是秒
    formatType: number
    voiceType: number
    voiceChangeType: number
    canConvert2Text: boolean
    waveAmplitudes: number[]
    fileSubId: ''
    playState: number
    autoConvertText: number
  }
}

export enum PicType {
  gif = 2000,
  jpg = 1000,
}

export enum PicSubType {
  normal = 0, // 普通图片，大图
  face = 1, // 表情包小图
}

export interface SendPicElement {
  elementType: ElementType.PIC
  elementId: ''
  picElement: {
    md5HexStr: string
    fileSize: number | string
    picWidth: number
    picHeight: number
    fileName: string
    sourcePath: string
    original: boolean
    picType: PicType
    picSubType: PicSubType
    fileUuid: string
    fileSubId: string
    thumbFileSize: number
    summary: string
  }
}

export interface SendReplyElement {
  elementType: ElementType.REPLY
  elementId: ''
  replyElement: Partial<ReplyElement>
}

export interface SendFaceElement {
  elementType: ElementType.FACE
  elementId: ''
  faceElement: FaceElement
}

export interface SendMarketFaceElement {
  elementType: ElementType.MFACE
  marketFaceElement: MarketFaceElement
}

export interface TextElement {
  content: string
  atType: number
  atUid: string
  atTinyId: string
  atNtUid: string
}

export interface ReplyElement {
  replayMsgSeq: string
  replayMsgId: string
  senderUin: string
  senderUinStr: string
  sourceMsgIdInRecords: string
  senderUid: string
  senderUidStr: string
  sourceMsgIsIncPic: boolean // 原消息是否有图片
  sourceMsgText: string
  replyMsgTime: string
}

export interface FileElement {
  fileMd5?: string
  fileName: string
  filePath: string
  fileSize: string
  picHeight?: number
  picWidth?: number
  folderId?: string
  picThumbPath?: Map<number, string>
  file10MMd5?: string
  fileSha?: string
  fileSha3?: string
  fileUuid?: string
  fileSubId?: string
  thumbFileSize?: number
  fileBizId?: number
}

export interface SendFileElement {
  elementType: ElementType.FILE
  elementId: ''
  fileElement: FileElement
}

export interface SendVideoElement {
  elementType: ElementType.VIDEO
  elementId: ''
  videoElement: VideoElement
}

export interface SendArkElement {
  elementType: ElementType.ARK
  elementId: ''
  arkElement: ArkElement
}

export type SendMessageElement =
  | SendTextElement
  | SendPttElement
  | SendPicElement
  | SendReplyElement
  | SendFaceElement
  | SendMarketFaceElement
  | SendFileElement
  | SendVideoElement
  | SendArkElement

export enum AtType {
  notAt = 0,
  atAll = 1,
  atUser = 2,
}

export enum ChatType {
  friend = 1,
  group = 2,
  temp = 100,
}

export interface PttElement {
  canConvert2Text: boolean
  duration: number // 秒数
  fileBizId: null
  fileId: number // 0
  fileName: string // "e4d09c784d5a2abcb2f9980bdc7acfe6.amr"
  filePath: string // "/Users//Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/nt_qq_a6b15c9820595d25a56c1633ce19ad40/nt_data/Ptt/2023-11/Ori/e4d09c784d5a2abcb2f9980bdc7acfe6.amr"
  fileSize: string // "4261"
  fileSubId: string // "0"
  fileUuid: string // "90j3z7rmRphDPrdVgP9udFBaYar#oK0TWZIV"
  formatType: string // 1
  invalidState: number // 0
  md5HexStr: string // "e4d09c784d5a2abcb2f9980bdc7acfe6"
  playState: number // 0
  progress: number // 0
  text: string // ""
  transferStatus: number // 0
  translateStatus: number // 0
  voiceChangeType: number // 0
  voiceType: number // 0
  waveAmplitudes: number[]
}

export interface ArkElement {
  bytesData: string
  linkInfo: null
  subElementType: null
}

export const IMAGE_HTTP_HOST = 'https://gchat.qpic.cn'
export const IMAGE_HTTP_HOST_NT = 'https://multimedia.nt.qq.com.cn'

export interface PicElement {
  picSubType: PicSubType
  picType: PicType  // 有这玩意儿吗
  originImageUrl: string // http url, 没有host，host是https://gchat.qpic.cn/, 带download参数的是https://multimedia.nt.qq.com.cn
  originImageMd5?: string
  sourcePath: string // 图片本地路径
  thumbPath: Map<number, string>
  picWidth: number
  picHeight: number
  fileSize: string
  fileName: string
  fileUuid: string
  md5HexStr?: string
}

export enum GrayTipElementSubType {
  REVOKE = 1,
  PROCLAMATION = 2,
  EMOJIREPLY = 3,
  GROUP = 4,
  BUDDY = 5,
  FEED = 6,
  ESSENCE = 7,
  GROUPNOTIFY = 8,
  BUDDYNOTIFY = 9,
  FILE = 10,
  FEEDCHANNELMSG = 11,
  XMLMSG = 12,
  LOCALMSG = 13,
  BLOCK = 14,
  AIOOP = 15,
  WALLET = 16,
  JSON = 17,
}

export interface GrayTipElement {
  subElementType: GrayTipElementSubType
  revokeElement?: {
    operatorRole: string
    operatorUid: string
    operatorNick: string
    operatorRemark: string
    operatorMemRemark?: string
    origMsgSenderUid?: string
    isSelfOperate?: boolean
    wording: string // 自定义的撤回提示语
  }
  aioOpGrayTipElement?: TipAioOpGrayTipElement
  groupElement?: TipGroupElement
  xmlElement?: {
    templId: string
    content: string
  }
  jsonGrayTipElement?: {
    busiId: string
    jsonStr: string
  }
}


export enum FaceIndex {
  dice = 358,
  RPS = 359, // 石头剪刀布
}

export interface FaceElement {
  faceIndex: number
  faceType: number
  faceText?: string
  packId?: string
  stickerId?: string
  sourceType?: number
  stickerType?: number
  resultId?: string
  surpriseId?: string
  randomType?: number
  pokeType?: number
}

export interface MarketFaceElement {
  emojiPackageId: number
  faceName?: string
  emojiId: string
  key: string
  imageWidth?: number
  imageHeight?: number
}

export interface VideoElement {
  filePath: string
  fileName: string
  videoMd5?: string
  thumbMd5?: string
  fileTime?: number // second
  thumbSize?: number // byte
  fileFormat?: number // 2表示mp4？
  fileSize?: string // byte
  thumbWidth?: number
  thumbHeight?: number
  busiType?: 0 // 未知
  subBusiType?: 0 // 未知
  thumbPath?: Map<number, string>
  transferStatus?: 0 // 未知
  progress?: 0 // 下载进度？
  invalidState?: 0 // 未知
  fileUuid?: string // 可以用于下载链接？
  fileSubId?: ''
  fileBizId?: null
  originVideoMd5?: ''
  import_rich_media_context?: null
  sourceVideoCodecFormat?: number
}

export interface MarkdownElement {
  content: string
}

export interface InlineKeyboardElementRowButton {
  id: ''
  label: string
  visitedLabel: string
  style: 1 // 未知
  type: 2 // 未知
  clickLimit: 0 // 未知
  unsupportTips: '请升级新版手机QQ'
  data: string
  atBotShowChannelList: false
  permissionType: 2
  specifyRoleIds: []
  specifyTinyids: []
  isReply: false
  anchor: 0
  enter: false
  subscribeDataTemplateIds: []
}
export interface InlineKeyboardElement {
  rows: [
    {
      buttons: InlineKeyboardElementRowButton[]
    },
  ]
}

export interface TipAioOpGrayTipElement {
  // 这是什么提示来着？
  operateType: number
  peerUid: string
  fromGrpCodeOfTmpChat: string
}

export enum TipGroupElementType {
  memberIncrease = 1,
  kicked = 3, // 被移出群
  ban = 8,
}

export interface TipGroupElement {
  type: TipGroupElementType // 1是表示有人加入群, 自己加入群也会收到这个
  role: 0 // 暂时不知
  groupName: string // 暂时获取不到
  memberUid: string
  memberNick: string
  memberRemark: string
  adminUid: string
  adminNick: string
  adminRemark: string
  createGroup: null
  memberAdd?: {
    showType: 1
    otherAdd: null
    otherAddByOtherQRCode: null
    otherAddByYourQRCode: null
    youAddByOtherQRCode: null
    otherInviteOther: null
    otherInviteYou: null
    youInviteOther: null
  }
  shutUp?: {
    curTime: string
    duration: string // 禁言时间，秒
    admin: {
      uid: string
      card: string
      name: string
      role: GroupMemberRole
    }
    member: {
      uid: string
      card: string
      name: string
      role: GroupMemberRole
    }
  }
}

export interface MultiForwardMsgElement {
  xmlContent: string // xml格式的消息内容
  resId: string
  fileName: string
}

export interface RawMessage {
  msgId: string
  msgType: number
  subMsgType: number
  msgShortId?: number // 自己维护的消息id
  msgTime: string // 时间戳，秒
  msgSeq: string
  msgRandom: string
  senderUid: string
  senderUin: string // 发送者QQ号
  peerUid: string // 群号 或者 QQ uid
  peerUin: string // 群号 或者 发送者QQ号
  guildId: string
  sendNickName: string
  sendMemberName?: string // 发送者群名片
  chatType: ChatType
  sendStatus?: number // 消息状态，别人发的2是已撤回，自己发的2是已发送
  recallTime: string // 撤回时间, "0"是没有撤回
  records: RawMessage[]
  elements: MessageElement[]
}

export interface Peer {
  chatType: ChatType
  peerUid: string  // 如果是群聊uid为群号，私聊uid就是加密的字符串
  guildId?: string
}

export interface MessageElement {
  elementType: ElementType
  elementId: string
  extBufForUI: string //"0x"
  textElement?: TextElement
  faceElement?: FaceElement
  marketFaceElement?: MarketFaceElement
  replyElement?: ReplyElement
  picElement?: PicElement
  pttElement?: PttElement
  videoElement?: VideoElement
  grayTipElement?: GrayTipElement
  arkElement?: ArkElement
  fileElement?: FileElement
  liveGiftElement?: unknown
  markdownElement?: MarkdownElement
  structLongMsgElement?: unknown
  multiForwardMsgElement?: MultiForwardMsgElement
  giphyElement?: unknown
  walletElement?: unknown
  inlineKeyboardElement?: InlineKeyboardElement
  textGiftElement?: unknown //????
  calendarElement?: unknown
  yoloGameResultElement?: unknown
  avRecordElement?: unknown
  structMsgElement?: unknown
  faceBubbleElement?: unknown
  shareLocationElement?: unknown
  tofuRecordElement?: unknown
  taskTopMsgElement?: unknown
  recommendedMsgElement?: unknown
  actionBarElement?: unknown
}

export interface OnRichMediaDownloadCompleteParams {
  fileModelId: string
  msgElementId: string
  msgId: string
  fileId: string
  fileProgress: string  // '0'
  fileSpeed: string  // '0'
  fileErrCode: string  // '0'
  fileErrMsg: string
  fileDownType: number  // 暂时未知
  thumbSize: number
  filePath: string
  totalSize: string
  trasferStatus: number
  step: number
  commonFileInfo: unknown
  fileSrvErrCode: string
  clientMsg: string
  businessId: number
  userTotalSpacePerDay: unknown
  userUsedSpacePerDay: unknown
}

export interface OnGroupFileInfoUpdateParams {
  retCode: number
  retMsg: string
  clientWording: string
  isEnd: boolean
  item: {
    peerId: string
    type: number
    folderInfo?: {
      folderId: string
      parentFolderId: string
      folderName: string
      createTime: number
      modifyTime: number
      createUin: string
      creatorName: string
      totalFileCount: number
      modifyUin: string
      modifyName: string
      usedSpace: string
    }
    fileInfo?: {
      fileModelId: string
      fileId: string
      fileName: string
      fileSize: string
      busId: number
      uploadedSize: string
      uploadTime: number
      deadTime: number
      modifyTime: number
      downloadTimes: number
      sha: string
      sha3: string
      md5: string
      uploaderLocalPath: string
      uploaderName: string
      uploaderUin: string
      parentFolderId: string
      localPath: string
      transStatus: number
      transType: number
      elementId: string
      isFolder: boolean
    }
  }[]
  allFileCount: number
  nextIndex: number
  reqId: number
}

export interface QueryMsgsParams {
  chatInfo: Peer
  filterMsgType: []
  filterSendersUid: string[]
  filterMsgFromTime: string
  filterMsgToTime: string
  pageLimit: number
  isReverseOrder: boolean
  isIncludeCurrent: boolean
}

export interface TmpChatInfoApi extends GeneralCallResult {
  tmpChatInfo?: {
    chatType: number
    fromNick: string
    groupCode: string
    peerUid: string
    sessionType: number
    sig: string
  }
}
