import { GroupMemberRole } from './group'
import { GeneralCallResult } from '../services'

export enum ElementType {
  Text = 1,
  Pic = 2,
  File = 3,
  Ptt = 4,
  Video = 5,
  Face = 6,
  Reply = 7,
  GrayTip = 8,
  Ark = 10,
  MarketFace = 11,
  LiveGift = 12,
  StructLongMsg = 13,
  Markdown = 14,
  Giphy = 15,
  MultiForward = 16,
  InlineKeyboard = 17,
  Calendar = 19,
  YoloGameResult = 20,
  AvRecord = 21,
  TofuRecord = 23,
  FaceBubble = 27,
  ShareLocation = 28,
  TaskTopMsg = 29,
  RecommendedMsg = 43,
  ActionBar = 44
}

export interface SendTextElement {
  elementType: ElementType.Text
  elementId: ''
  textElement: TextElement
}

export interface SendPttElement {
  elementType: ElementType.Ptt
  elementId: ''
  pttElement: Partial<PttElement>
}

export interface SendPicElement {
  elementType: ElementType.Pic
  elementId: ''
  picElement: Partial<PicElement>
}

export interface SendReplyElement {
  elementType: ElementType.Reply
  elementId: ''
  replyElement: Partial<ReplyElement>
}

export interface SendFaceElement {
  elementType: ElementType.Face
  elementId: ''
  faceElement: FaceElement
}

export interface SendMarketFaceElement {
  elementType: ElementType.MarketFace
  elementId: ''
  marketFaceElement: MarketFaceElement
}

export interface SendFileElement {
  elementType: ElementType.File
  elementId: ''
  fileElement: FileElement
}

export interface SendVideoElement {
  elementType: ElementType.Video
  elementId: ''
  videoElement: VideoElement
}

export interface SendArkElement {
  elementType: ElementType.Ark
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
  Unknown,
  All,
  One,
}

export interface TextElement {
  content: string
  atType: AtType
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
  formatType: number // 1
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
  autoConvertText: number
}

export interface ArkElement {
  bytesData: string
  linkInfo: null
  subElementType: null
}

export const IMAGE_HTTP_HOST = 'https://gchat.qpic.cn'
export const IMAGE_HTTP_HOST_NT = 'https://multimedia.nt.qq.com.cn'

export enum PicType {
  GIF = 2000,
  JPEG = 1000,
}

export enum PicSubType {
  Normal = 0, // 普通图片，大图
  Face = 1, // 表情包小图
}

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

export interface TipAioOpGrayTipElement {
  operateType: number
  peerUid: string
  fromGrpCodeOfTmpChat: string
}

export enum TipGroupElementType {
  MemberIncrease = 1,
  Kicked = 3, // 被移出群
  Ban = 8,
}

export interface TipGroupElement {
  type: TipGroupElementType // 1是表示有人加入群, 自己加入群也会收到这个
  role: number
  groupName: string // 暂时获取不到
  memberUid: string
  memberNick: string
  memberRemark: string
  adminUid: string
  adminNick: string
  adminRemark: string
  createGroup: null
  memberAdd?: {
    showType: number
    otherAdd?: {
      uid: string
      name: string
    }
    otherAddByOtherQRCode?: unknown
    otherAddByYourQRCode?: unknown
    youAddByOtherQRCode?: unknown
    otherInviteOther?: unknown
    otherInviteYou?: unknown
    youInviteOther?: unknown
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

export enum GrayTipElementSubType {
  Revoke = 1,
  Proclamation = 2,
  EmojiReply = 3,
  Group = 4,
  Buddy = 5,
  Feed = 6,
  Essence = 7,
  GroupNotify = 8,
  BuddyNotify = 9,
  File = 10,
  FeedChannelMsg = 11,
  XmlMsg = 12,
  LocalMsg = 13,
  Block = 14,
  AioOp = 15,
  Wallet = 16,
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
    templParam: Map<string, string>
    members: Map<string, string> // uid -> remark
  }
  jsonGrayTipElement?: {
    busiId: string
    jsonStr: string
    xmlToJsonParam?: {
      templParam: Map<string, string>
    }
  }
}

export enum FaceIndex {
  Dice = 358,
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
  supportSize?: {
    width: number
    height: number
  }[]
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

export interface StructLongMsgElement {
  xmlContent: string
  resId: string
}

export interface MultiForwardMsgElement {
  xmlContent: string // xml格式的消息内容
  resId: string
  fileName: string
}

export enum ChatType {
  C2C = 1,
  Group = 2,
  TempC2CFromGroup = 100,
}

export interface RawMessage {
  msgId: string
  msgType: number
  subMsgType: number
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
  sendRemarkName?: string // 发送者好友备注
  chatType: ChatType
  sendStatus?: number // 消息状态，别人发的2是已撤回，自己发的2是已发送
  recallTime: string // 撤回时间, "0"是没有撤回
  records: RawMessage[]
  elements: MessageElement[]
  peerName: string
  multiTransInfo?: {
    status: number
    msgId: number
    friendFlag: number
    fromFaceUrl: string
  }
  emojiLikesList: {
    emojiId: string
    emojiType: string
    likesCnt: string
    isClicked: boolean
  }[]
  msgAttrs: Map<number, {
    attrType: number
    attrId: string
  }>
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
  structLongMsgElement?: StructLongMsgElement
  multiForwardMsgElement?: MultiForwardMsgElement
  giphyElement?: unknown
  inlineKeyboardElement?: InlineKeyboardElement
  textGiftElement?: unknown
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

export interface RichMediaDownloadCompleteNotify {
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

export interface GroupFileInfo {
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

export interface GetFileListParam {
  sortType: number
  fileCount: number
  startIndex: number
  sortOrder: number
  showOnlinedocFolder: number
  folderId?: string
}
