/**
 * OneBot11 事件类型统一导出
 * 包含所有消息、通知、请求和元事件类型
 */

// 基础事件类
export { OB11BaseEvent, EventType } from './OB11BaseEvent'

// 消息事件
export { OB11MessageEvent } from './message/OB11MessageEvent'

// 元事件
export { OB11BaseMetaEvent } from './meta/OB11BaseMetaEvent'
export { OB11HeartbeatEvent } from './meta/OB11HeartbeatEvent'
export { OB11LifeCycleEvent } from './meta/OB11LifeCycleEvent'

// 通知事件
export { OB11BaseNoticeEvent } from './notice/OB11BaseNoticeEvent'
export { OB11FriendAddNoticeEvent } from './notice/OB11FriendAddNoticeEvent'
export { OB11FriendRecallNoticeEvent } from './notice/OB11FriendRecallNoticeEvent'
export { OB11GroupAdminNoticeEvent } from './notice/OB11GroupAdminNoticeEvent'
export { GroupBanEvent } from './notice/OB11GroupBanEvent'
export { OB11GroupCardEvent } from './notice/OB11GroupCardEvent'
export { OB11GroupDecreaseEvent } from './notice/OB11GroupDecreaseEvent'
export { OB11GroupDismissEvent } from './notice/OB11GroupDismissEvent'
export { GroupEssenceEvent } from './notice/OB11GroupEssenceEvent'
export { OB11GroupIncreaseEvent } from './notice/OB11GroupIncreaseEvent'
export { OB11GroupNoticeEvent } from './notice/OB11GroupNoticeEvent'
export { OB11GroupRecallNoticeEvent } from './notice/OB11GroupRecallNoticeEvent'
export { OB11GroupTitleEvent } from './notice/OB11GroupTitleEvent'
export { OB11GroupUploadNoticeEvent } from './notice/OB11GroupUploadNoticeEvent'
export { OB11GroupMsgEmojiLikeEvent } from './notice/OB11MsgEmojiLikeEvent'
export { 
  OB11FriendPokeEvent, 
  OB11GroupPokeEvent,
  OB11FriendPokeRecallEvent,
  OB11GroupPokeRecallEvent 
} from './notice/OB11PokeEvent'
export { OB11ProfileLikeEvent } from './notice/OB11ProfileLikeEvent'
export {
  OB11FlashFileDownloadingEvent,
  OB11FlashFileDownloadedEvent,
  OB11FlashFileUploadingEvent,
  OB11FlashFileUploadedEvent
} from './notice/OB11FlashFileEvent'

// 请求事件
export { OB11FriendRequestEvent } from './request/OB11FriendRequest'
export { OB11GroupRequestEvent } from './request/OB11GroupRequest'

// 导入所有事件类型用于联合类型定义
import type { OB11BaseMessageEvent } from './message/OB11BaseMessageEvent'
import type { OB11HeartbeatEvent } from './meta/OB11HeartbeatEvent'
import type { OB11LifeCycleEvent } from './meta/OB11LifeCycleEvent'
import type { OB11FriendAddNoticeEvent } from './notice/OB11FriendAddNoticeEvent'
import type { OB11FriendRecallNoticeEvent } from './notice/OB11FriendRecallNoticeEvent'
import type { OB11GroupAdminNoticeEvent } from './notice/OB11GroupAdminNoticeEvent'
import type { GroupBanEvent } from './notice/OB11GroupBanEvent'
import type { OB11GroupCardEvent } from './notice/OB11GroupCardEvent'
import type { OB11GroupDecreaseEvent } from './notice/OB11GroupDecreaseEvent'
import type { OB11GroupDismissEvent } from './notice/OB11GroupDismissEvent'
import type { GroupEssenceEvent } from './notice/OB11GroupEssenceEvent'
import type { OB11GroupIncreaseEvent } from './notice/OB11GroupIncreaseEvent'
import type { OB11GroupRecallNoticeEvent } from './notice/OB11GroupRecallNoticeEvent'
import type { OB11GroupTitleEvent } from './notice/OB11GroupTitleEvent'
import type { OB11GroupUploadNoticeEvent } from './notice/OB11GroupUploadNoticeEvent'
import type { OB11GroupMsgEmojiLikeEvent } from './notice/OB11MsgEmojiLikeEvent'
import type { 
  OB11FriendPokeEvent, 
  OB11GroupPokeEvent,
  OB11FriendPokeRecallEvent,
  OB11GroupPokeRecallEvent 
} from './notice/OB11PokeEvent'
import type { OB11ProfileLikeEvent } from './notice/OB11ProfileLikeEvent'
import type {
  OB11FlashFileDownloadingEvent,
  OB11FlashFileDownloadedEvent,
  OB11FlashFileUploadingEvent,
  OB11FlashFileUploadedEvent
} from './notice/OB11FlashFileEvent'
import type { OB11FriendRequestEvent } from './request/OB11FriendRequest'
import type { OB11GroupRequestEvent } from './request/OB11GroupRequest'
import { OB11MessageEvent } from './message/OB11MessageEvent'

/**
 * 所有 OneBot11 事件的联合类型
 * 用于类型检查和事件处理
 */
export type OB11Event = 
  // 消息事件
  OB11MessageEvent
  // 元事件
  | OB11HeartbeatEvent
  | OB11LifeCycleEvent
  // 通知事件
  | OB11FriendAddNoticeEvent
  | OB11FriendRecallNoticeEvent
  | OB11GroupAdminNoticeEvent
  | GroupBanEvent
  | OB11GroupCardEvent
  | OB11GroupDecreaseEvent
  | OB11GroupDismissEvent
  | GroupEssenceEvent
  | OB11GroupIncreaseEvent
  | OB11GroupRecallNoticeEvent
  | OB11GroupTitleEvent
  | OB11GroupUploadNoticeEvent
  | OB11GroupMsgEmojiLikeEvent
  | OB11FriendPokeEvent
  | OB11GroupPokeEvent
  | OB11FriendPokeRecallEvent
  | OB11GroupPokeRecallEvent
  | OB11ProfileLikeEvent
  | OB11FlashFileDownloadingEvent
  | OB11FlashFileDownloadedEvent
  | OB11FlashFileUploadingEvent
  | OB11FlashFileUploadedEvent
  // 请求事件
  | OB11FriendRequestEvent
  | OB11GroupRequestEvent
