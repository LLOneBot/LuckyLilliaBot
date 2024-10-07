import { Context } from 'cordis'
import { Awaitable, Dict } from 'cosmokit'
import { ObjectToSnake } from 'ts-case-convert'
import { getChannel } from './channel/get'
import { getChannelList } from './channel/list'
import { updateChannel } from './channel/update'
import { deleteChannel } from './channel/delete'
import { muteChannel } from './channel/mute'
import { createDirectChannel } from './channel/user/create'
import { getGuild } from './guild/get'
import { getGuildList } from './guild/list'
import { handleGuildRequest } from './guild/approve'
import { getLogin } from './login/get'
import { getGuildMember } from './member/get'
import { getGuildMemberList } from './member/list'
import { kickGuildMember } from './member/kick'
import { muteGuildMember } from './member/mute'
import { handleGuildMemberRequest } from './member/approve'
import { createMessage } from './message/create'
import { getMessage } from './message/get'
import { deleteMessage } from './message/delete'
import { getMessageList } from './message/list'
import { createReaction } from './reaction/create'
import { deleteReaction } from './reaction/delete'
import { getReactionList } from './reaction/list'
import { setGuildMemberRole } from './role/member/set'
import { getGuildRoleList } from './role/list'
import { getUser } from './user/get'
import { getFriendList } from './user/list'
import { handleFriendRequest } from './user/approve'

export type Handler<
  R extends Dict = Dict,
  P extends Dict = any
> = (ctx: Context, payload: P) => Awaitable<ObjectToSnake<R>>

export const handlers: Record<string, Handler> = {
  // 频道 (Channel)
  getChannel,
  getChannelList,
  updateChannel,
  deleteChannel,
  muteChannel,
  createDirectChannel,
  // 群组 (Guild)
  getGuild,
  getGuildList,
  handleGuildRequest,
  // 登录信息 (Login)
  getLogin,
  // 群组成员 (GuildMember)
  getGuildMember,
  getGuildMemberList,
  kickGuildMember,
  muteGuildMember,
  handleGuildMemberRequest,
  // 消息 (Message)
  createMessage,
  getMessage,
  deleteMessage,
  getMessageList,
  // 表态 (Reaction)
  createReaction,
  deleteReaction,
  getReactionList,
  // 群组角色 (GuildRole)
  setGuildMemberRole,
  getGuildRoleList,
  // 用户 (User)
  getUser,
  getFriendList,
  handleFriendRequest,
}
