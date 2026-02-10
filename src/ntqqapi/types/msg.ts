import { GroupMemberRole } from './group'

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
  fileElement: Partial<FileElement>
}

export interface SendVideoElement {
  elementType: ElementType.Video
  elementId: ''
  videoElement: Partial<VideoElement>
}

export interface SendArkElement {
  elementType: ElementType.Ark
  elementId: ''
  arkElement: Partial<ArkElement>
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
  replayMsgId: string
  replayMsgSeq: string
  replayMsgRootSeq: string
  replayMsgRootMsgId: string
  replayMsgRootCommentCnt: string
  sourceMsgIdInRecords: string
  sourceMsgText: string
  sourceMsgTextElems: {
    replyAbsElemType: number
    textElemContent: string
    faceElem: unknown
    picElem: unknown
  }[]
  senderUid: string
  senderUidStr: string
  replyMsgClientSeq: string
  replyMsgTime: string
  replyMsgRevokeType: number
  sourceMsgIsIncPic: boolean
  sourceMsgExpired: boolean
  anonymousNickName: unknown
  originalMsgState: unknown
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
  fileUuid: string
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
  storeID: number
  otherBusinessInfo: {
    aiVoiceType: number
  }
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
  fileName: string
  fileSize: string
  picWidth: number
  picHeight: number
  original: boolean
  md5HexStr: string
  sourcePath: string
  thumbPath: Map<number, string>
  transferStatus: number
  progress: number
  picType: PicType
  invalidState: number
  fileUuid: string
  fileSubId: string
  thumbFileSize: number
  fileBizId: unknown
  downloadIndex: unknown
  summary: string
  emojiFrom: unknown
  emojiWebUrl: unknown
  emojiAd: {
    url: string
    desc: string
  },
  emojiMall: {
    packageId: number
    emojiId: number
  },
  emojiZplan: {
    actionId: number
    actionName: string
    actionType: number
    playerNumber: number
    peerUid: string
    bytesReserveInfo: string
  },
  originImageMd5: string
  originImageUrl: string
  import_rich_media_context: unknown
  isFlashPic: unknown
  storeID: number
}

export interface TipAioOpGrayTipElement {
  operateType: number
  peerUid: string
  fromGrpCodeOfTmpChat: string
}

export enum TipGroupElementType {
  Unknown,
  MemberAdd,
  Disbanded,
  Quitted,
  Created,
  GroupNameModified,
  Block,
  Unblock,
  ShutUp,
  BeRecycled,
  DisbandOrBeRecycled
}

export interface TipGroupElement {
  type: TipGroupElementType // 1是表示有人加入群, 自己加入群也会收到这个
  role: number
  groupName: string
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

export interface TipXmlElement {
  busiType: string
  busiId: string
  c2cType: number
  serviceType: number
  ctrlFlag: number
  content: string
  templId: string
  seqId: string,
  templParam: Map<string, string>
  pbReserv: Record<string, number>
  members: Map<string, string> // uid -> remark
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

export enum JsonGrayTipBusId {
  AddedFriend = '19324',
  Poke = '1061',
  GroupMemberTitleChanged = '2407',
  GroupEssenceMsg = '2401',
  GroupNewMemberInvited = '19217',
}

export interface GrayTipElement {
  subElementType: GrayTipElementSubType
  revokeElement?: {
    operatorTinyId: string
    operatorRole: string
    operatorUid: string
    operatorNick: string
    operatorRemark: string
    operatorMemRemark: string
    origMsgSenderUid: string
    origMsgSenderNick: string
    origMsgSenderRemark: string
    origMsgSenderMemRemark: string
    isSelfOperate: boolean
    wording: string // 自定义的撤回提示语
  }
  aioOpGrayTipElement?: TipAioOpGrayTipElement
  groupElement?: TipGroupElement
  xmlElement?: TipXmlElement
  jsonGrayTipElement?: {
    busiId: JsonGrayTipBusId
    jsonStr: string
    recentAbstract: string
    isServer: boolean
    xmlToJsonParam: {
      busiType: string
      busiId: string
      c2cType: number
      serviceType: number
      ctrlFlag: number
      content: string
      templId: string
      seqId: string
      templParam: Map<string, string>
      pbReserv: {}
      members: Map<string, string>
    }
  }
}

export enum FaceIndex {
  Dice = 358,
  RPS = 359, // 石头剪刀布
}

export enum FaceType {
  Normal = 1, // 普通小黄脸表情
  Super = 3, // 超级表情
  Poke = 5  // 戳一戳，窗口抖动那种，私聊才有
}

export interface FaceElement {
  faceIndex: number
  faceType: FaceType
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
  faceName: string
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
  videoMd5: string
  thumbMd5: string
  fileTime: number
  thumbSize: number
  fileFormat: number
  fileSize: string
  thumbWidth: number
  thumbHeight: number
  busiType: number
  subBusiType: number
  thumbPath: Map<number, string>
  transferStatus: number
  progress: number
  invalidState: number
  fileUuid: string
  fileSubId: string
  fileBizId: unknown
  originVideoMd5: string
  import_rich_media_context: unknown
  sourceVideoCodecFormat: number
  storeID: number
}

export interface MarkdownElement {
  content: string
}

export interface InlineKeyboardElementRowButton {
  id: string // 按钮ID：在一个keyboard消息内设置唯一
  label: string // 按钮上的文字
  visitedLabel: string // 点击后按钮的上文字
  style: number // 按钮样式：0 灰色线框，1 蓝色线框
  type: number // 设置 0 跳转按钮：http 或 小程序 客户端识别 scheme，设置 1 回调按钮：回调后台接口, data 传给后台，设置 2 指令按钮：自动在输入框插入 @bot data
  clickLimit: number // 【已弃用】可操作点击的次数，默认不限
  unsupportTips: string // 客户端不支持本action的时候，弹出的toast文案
  data: string // 操作相关的数据
  atBotShowChannelList: boolean // 	本字段仅在指令按钮下有效，设置后后会忽略 action.enter 配置。设置为 1 时 ，点击按钮自动唤起启手Q选图器，其他值暂无效果。（仅支持手机端版本 8983+ 的单聊场景，桌面端不支持）
  permissionType: number // 0 指定用户可操作，1 仅管理者可操作，2 所有人可操作，3 指定身份组可操作（仅频道可用）
  specifyRoleIds: string[] // 有权限的身份组 id 的列表（仅频道可用）
  specifyTinyids: string[] // 有权限的用户 id 的列表
  isReply: boolean // 指令按钮可用，指令是否带引用回复本消息，默认 false。支持版本 8983
  anchor: number // 本字段仅在指令按钮下有效，设置后后会忽略 action.enter 配置。设置为 1 时 ，点击按钮自动唤起启手Q选图器，其他值暂无效果。（仅支持手机端版本 8983+ 的单聊场景，桌面端不支持）
  enter: boolean // 指令按钮可用，点击按钮后直接自动发送 data，默认 false。支持版本 8983
  subscribeDataTemplateIds: [] // 未知
}

export interface InlineKeyboardElement {
  botAppid?: string
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
  msgType: ElementType
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
  sendMemberName: string // 发送者群名片
  sendRemarkName: string // 发送者好友备注
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
  msgAttrs: Map<number, MsgAttr>
  isOnlineMsg: boolean // 是否为在线消息，灰条消息会被判定为非在线消息
}

// VAS 消息信息（气泡、字体等）
export interface VasMsgInfo {
  msgNamePlateInfo?: {
    msgVipType: number
    msgVipLevel: number
    msgBigClubFlag?: number | null
    msgBigClubLevel: number
    grayNamePlate: number
    namePlateType: number
    vipStarFlag?: number | null
    namePlateId: number
    carouselNamePlateIds: number[]
    extendNamePlateId?: number | null
    gameNamePlateId?: number | null
  }
  bubbleInfo?: {
    bubbleId: number
    bubbleDiyTextId: number
    subBubbleId: number
    canConvertToText?: boolean | null
  }
  avatarPendantInfo?: {
    avatarId: number
    pendantId: string
    pendantDiyInfoId: number
  }
  vasFont?: {
    fontId: number
    subFontId?: number | null
    diyFontCfgUpdateTime: number
    diyFontImageId: number
    magicFontType: number
  }
  iceBreakInfo?: {
    templateID?: string | null
    isIceBreakMsg?: boolean | null
  }
}

// VAS 个人信息
export interface VasPersonalInfo {
  troopNameColorId?: number | null
  vipNumbers: number[]
  vaDataChangeRand: number
  vasPersonalNamePlate?: any | null
  extInfo?: any | null
}

// 群荣誉信息（等级、头衔）
export interface GroupHonorInfo {
  richFlag: number
  honorIds: number[]
  level: number
  oldLevel?: number | null
  rankSeq: string
  titleId: number
  uniqueTitle: string
}

// 王者荣誉信息
export interface KingHonorInfo {
  kingHonorLevel: number
  groupInfoFlagEx4: number
  groupMsgBusiBuf?: any | null
}

// 消息属性基础字段
interface MsgAttrBase {
  attrId: string
  publicAccountAttrs?: any | null
  sharedMsgInfo?: any | null
  gameChatSession?: any | null
  uinInfoAttr?: any | null
  longMsgAttr?: any | null
  robotExt?: any | null
  zPlanMsgInfo?: any | null
  qqConnectAttr?: any | null
  extendBusiness?: any | null
  sendMsgRspTransSvrInfo?: any | null
  adelieMsgAttr?: any | null
  feedBackStateInfo?: any | null
  memoryStateMsgInfo?: any | null
  attaReportData?: any | null
  liteAction?: any | null
  botMetaData?: any | null
}

// attrType 0: VAS 消息信息
export interface MsgAttrVasMsg extends MsgAttrBase {
  attrType: 0
  vasMsgInfo: VasMsgInfo
  vasPersonalInfo?: null
  groupHonor?: null
  kingHonor?: null
}

// attrType 1: VAS 个人信息
export interface MsgAttrVasPersonal extends MsgAttrBase {
  attrType: 1
  vasMsgInfo?: null
  vasPersonalInfo: VasPersonalInfo
  groupHonor?: null
  kingHonor?: null
}

// attrType 2: 群荣誉信息
export interface MsgAttrGroupHonor extends MsgAttrBase {
  attrType: 2
  vasMsgInfo?: null
  vasPersonalInfo?: null
  groupHonor: GroupHonorInfo
  kingHonor?: null
}

// attrType 3: 王者荣誉信息
export interface MsgAttrKingHonor extends MsgAttrBase {
  attrType: 3
  vasMsgInfo?: null
  vasPersonalInfo?: null
  groupHonor?: null
  kingHonor: KingHonorInfo
}

// 消息属性联合类型
export type MsgAttr = MsgAttrVasMsg | MsgAttrVasPersonal | MsgAttrGroupHonor | MsgAttrKingHonor

export interface Peer {
  chatType: ChatType
  peerUid: string  // 如果是群聊uid为群号，私聊uid就是加密的字符串
  guildId: string
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
  filterMsgType?: []
  filterSendersUid?: string[]
  filterMsgFromTime: string
  filterMsgToTime: string
  pageLimit: number
  isReverseOrder?: boolean
  isIncludeCurrent: boolean
}

export interface GetFileListParam {
  sortType: number
  fileCount: number
  startIndex: number
  sortOrder: number
  showOnlinedocFolder: number
  folderId?: string
}

export interface RichMediaUploadCompleteNotify {
  fileModelId: string
  msgElementId: string
  msgId: string
  fileId: string
  fileProgress: string
  fileSpeed: string
  fileErrCode: string
  fileErrMsg: string
  fileDownType: number
  thumbSize: number
  filePath: string
  totalSize: string
  trasferStatus: number
  step: number
  commonFileInfo: {
    fileModelId: string
    msgId: string
    elemId: string
    uuid: string
    subId: string
    fileName: string
    fileSize: string
    msgTime: string
    peerUid: string
    chatType: number
    md5: string
    md510m: string
    sha: string
    sha3: string
    parent: unknown
    favId: unknown
    bizType: number
    picThumbPath: unknown
  },
  fileSrvErrCode: string
  clientMsg: string
  businessId: number
  userTotalSpacePerDay: unknown
  userUsedSpacePerDay: unknown
  msgRecord: unknown
  chatType: number
}

export enum RMBizType {
  Unknown,
  C2CFile,
  GroupFile,
  C2CPic,
  GroupPic,
  DiscPic,
  C2CVideo,
  GroupVideo,
  C2CPtt,
  GroupPtt,
}

