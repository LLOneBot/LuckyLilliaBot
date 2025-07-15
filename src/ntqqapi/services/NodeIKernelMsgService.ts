import { ElementType, MessageElement, Peer, RawMessage, QueryMsgsParams, TmpChatInfoApi } from '@/ntqqapi/types'
import { GeneralCallResult } from './common'

export interface NodeIKernelMsgService {
  generateMsgUniqueId(chatType: number, time: string): string

  sendMsg(msgId: string, peer: Peer, msgElements: MessageElement[], msgAttributeInfos: Map<unknown, unknown>): Promise<GeneralCallResult>

  recallMsg(peer: Peer, msgIds: string[]): Promise<GeneralCallResult>

  setStatus(statusReq: { status: number, extStatus: number, batteryStatus: number }): Promise<GeneralCallResult>

  forwardMsg(msgIds: string[], srcContact: Peer, dstContacts: Peer[], commentElements: MessageElement[]): Promise<GeneralCallResult & {
    detailErr: Map<unknown, unknown>
  }>

  forwardMsgWithComment(msgIds: string[], srcContact: Peer, dstContacts: Peer[], commentElements: MessageElement[], msgAttributeInfos: Map<unknown, unknown>): Promise<GeneralCallResult & {
    detailErr: Map<unknown, unknown>
  }>

  multiForwardMsgWithComment(...args: unknown[]): unknown

  getAioFirstViewLatestMsgs(peer: Peer, cnt: number): Promise<GeneralCallResult & { msgList: RawMessage[] }>

  getAioFirstViewLatestMsgsAndAddActiveChat(...args: unknown[]): Promise<GeneralCallResult & { msgList: RawMessage[] }>

  getMsgsIncludeSelfAndAddActiveChat(...args: unknown[]): Promise<GeneralCallResult & { msgList: RawMessage[] }>

  getMsgsIncludeSelf(peer: Peer, msgId: string, cnt: number, queryOrder: boolean): Promise<GeneralCallResult & { msgList: RawMessage[] }>

  getMsgsBySeqAndCount(peer: Peer, msgSeq: string, cnt: number, queryOrder: boolean, incloudeDeleteMsg: boolean): Promise<GeneralCallResult & { msgList: RawMessage[] }>

  getMsgsByMsgId(peer: Peer, ids: string[]): Promise<GeneralCallResult & { msgList: RawMessage[] }>

  getMsgsBySeqList(peer: Peer, seqList: string[]): Promise<GeneralCallResult & { msgList: RawMessage[] }>

  getSingleMsg(peer: Peer, msgSeq: string): Promise<GeneralCallResult & { msgList: RawMessage[] }>

  queryMsgsWithFilterEx(msgId: string, msgTime: string, megSeq: string, param: QueryMsgsParams): Promise<GeneralCallResult & {
    msgList: RawMessage[]
  }>

  setMsgRead(peer: Peer): Promise<GeneralCallResult>

  getRichMediaFilePathForGuild(path_info: {
    md5HexStr: string
    fileName: string
    elementType: ElementType
    elementSubType: number
    thumbSize: 0
    needCreate: true
    downloadType: 1
    file_uuid: ''
  }): string

  fetchFavEmojiList(resId: string, count: number, backwardFetch: boolean, forceRefresh: boolean): Promise<GeneralCallResult & {
    emojiInfoList: {
      uin: string
      emoId: number
      emoPath: string
      isExist: boolean
      resId: string
      url: string
      md5: string
      emoOriginalPath: string
      thumbPath: string
      RomaingType: string
      isAPNG: false
      isMarkFace: false
      eId: string
      epId: string
      ocrWord: string
      modifyWord: string
      exposeNum: number
      clickNum: number
      desc: string
    }[]
  }>

  downloadRichMedia(...args: unknown[]): unknown

  setMsgEmojiLikes(...args: unknown[]): Promise<GeneralCallResult>

  getMsgEmojiLikesList(peer: Peer, msgSeq: string, emojiId: string, emojiType: string, cookie: string, bForward: boolean, number: number): Promise<{
    result: number
    errMsg: string
    emojiLikesList: {
      tinyId: string
      nickName: string
      headUrl: string
    }[]
    cookie: string
    isLastPage: boolean
    isFirstPage: boolean
  }>

  getMultiMsg(...args: unknown[]): Promise<GeneralCallResult & { msgList: RawMessage[] }>

  getTempChatInfo(chatType: number, uid: string): Promise<TmpChatInfoApi>

  sendSsoCmdReqByContend(ssoCmd: string, content: string): Promise<GeneralCallResult & { rsp: string }>
}
