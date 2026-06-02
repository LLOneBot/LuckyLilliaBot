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
  textElement: TextElement
}

export interface SendPttElement {
  elementType: ElementType.Ptt
  pttElement: Partial<PttElement>
}

export interface SendPicElement {
  elementType: ElementType.Pic
  picElement: Partial<PicElement>
}

export interface SendReplyElement {
  elementType: ElementType.Reply
  replyElement: ReplyElement
}

export interface SendFaceElement {
  elementType: ElementType.Face
  faceElement: FaceElement
}

export interface SendMarketFaceElement {
  elementType: ElementType.MarketFace
  marketFaceElement: MarketFaceElement
}

export interface SendVideoElement {
  elementType: ElementType.Video
  videoElement: Partial<VideoElement>
}

export interface SendArkElement {
  elementType: ElementType.Ark
  arkElement: Partial<ArkElement>
}

export interface SendMultiForwardMsgElement {
  elementType: ElementType.MultiForward
  multiForwardMsgElement: Partial<MultiForwardMsgElement>
}

export type SendMessageElement =
  | SendTextElement
  | SendPttElement
  | SendPicElement
  | SendReplyElement
  | SendFaceElement
  | SendMarketFaceElement
  | SendVideoElement
  | SendArkElement
  | SendMultiForwardMsgElement

export enum AtType {
  Unknown,
  All,
  One,
}

export interface TextElement {
  content: string
  atType: AtType
  atUin: number
}

export interface ReplyElement {
  replyMsgSeq: number
  replyMsgTime: number
  senderUin: number
  replyMsgClientSeq: number
}

export interface FileElement {
  fileMd5: string
  fileName: string
  filePath: string
  fileSize: number
  folderId: string
  fileUuid: string
  fileBizId: number
}

export interface PttElement {
  duration: number // 秒数
  fileName: string // "e4d09c784d5a2abcb2f9980bdc7acfe6.amr"
  filePath: string // "/Users//Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/nt_qq_a6b15c9820595d25a56c1633ce19ad40/nt_data/Ptt/2023-11/Ori/e4d09c784d5a2abcb2f9980bdc7acfe6.amr"
  fileSize: number // "4261"
  fileUuid: string // "90j3z7rmRphDPrdVgP9udFBaYar#oK0TWZIV"
  formatType: number // 1
  md5HexStr: string // "e4d09c784d5a2abcb2f9980bdc7acfe6"
}

export interface ArkElement {
  bytesData: string
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
  fileName: string
  fileSize: number
  picWidth: number
  picHeight: number
  md5HexStr: string
  sourcePath: string
  picType: PicType
  picSubType: PicSubType
  fileUuid: string
  summary: string
  originImageUrl: string
}

export enum FaceIndex {
  Dice = 358,
  RPS = 359, // 石头剪刀布
}

export enum FaceType {
  Old = 1, // 普通小黄脸表情
  Normal = 2, // 常规表情
  Super = 3, // 超级表情
  Poke = 5  // 戳一戳，窗口抖动那种，私聊才有
}

export interface FaceElement {
  faceIndex: number
  faceType: FaceType
  faceText: string
  packId?: string
  stickerId?: string
  stickerType?: number
  resultId?: string
  pokeType?: number
}

export interface MarketFaceElement {
  emojiPackageId: number
  faceName: string
  emojiId: string
  key: string
  imageWidth: number
  imageHeight: number
}

export interface VideoElement {
  filePath: string
  fileName: string
  videoMd5: string
  fileTime: number
  fileFormat: number
  fileSize: number
  thumbWidth: number
  thumbHeight: number
  thumbPath: string
  fileUuid: string
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
  nodes: {
    senderUin: number
    senderName: string
    elements: SendMessageElement[]
  }[]
  title: string | null
  preview: string[] | null
  summary: string | null
  prompt: string | null
}

export enum ChatType {
  C2C = 1,
  Group = 2,
  TempC2CFromGroup = 100,
}

export interface RawMessage {
  msgId: string
  msgTime: number // 时间戳，秒
  msgSeq: number
  msgRandom: number
  senderUid: string
  senderUin: number // 发送者QQ号
  peerUid: string // 群号 或者 QQ uid
  peerUin: number // 群号 或者 发送者QQ号
  sendNickName: string
  sendMemberName: string // 发送者群名片
  chatType: ChatType
  elements: MessageElement[]
  peerName: string
  tempFromGroupCode: number
  clientSeq: number
}

export interface Peer {
  chatType: ChatType
  peerUid: string  // 如果是群聊uid为群号，私聊uid就是加密的字符串
}

export interface MessageElement {
  elementType: ElementType
  textElement?: TextElement
  faceElement?: FaceElement
  marketFaceElement?: MarketFaceElement
  replyElement?: ReplyElement
  picElement?: PicElement
  pttElement?: PttElement
  videoElement?: VideoElement
  grayTipElement?: unknown
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
