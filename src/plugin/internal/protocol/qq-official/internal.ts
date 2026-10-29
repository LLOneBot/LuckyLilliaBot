import type { QQOfficialApi } from './api'
import type {
  BotGroupState, GroupInfo, GroupMember, Guild, GuildChannel, GuildMember, GuildMessage, JoinRequest, Menu, PanelItem,
  PanelList, PanelRecord, RestrictChatSetting, SendRequest, SendResponse, User, ChannelSendRequest,
} from './types'

type Method = (...args: any[]) => Promise<any>

/**
 * Every REST endpoint, by the name the Koishi QQ adapters give it, for what the neutral API does not cover. Path
 * parameters come first in order; then the body, or the query for GET / DELETE; a body may be followed by a query.
 */
export interface Internal {
  [name: string]: Method
}

export interface GroupInternal extends Internal {
  sendMessage(groupOpenid: string, data: SendRequest): Promise<SendResponse>
  sendPrivateMessage(openid: string, data: SendRequest): Promise<SendResponse>
  acknowledgeInteraction(interactionId: string, data: { code: number }): Promise<unknown>
  getGroupInfo(groupOpenid: string): Promise<GroupInfo>
  getBotGroupState(groupOpenid: string): Promise<BotGroupState>
  getGroupMembers(groupOpenid: string, params?: { cursor?: string }): Promise<{ members?: GroupMember[]; next_cursor?: string }>
  getGroupMember(groupOpenid: string, memberOpenid: string): Promise<GroupMember>
  batchRemoveGroupMembers(groupOpenid: string, data: { member_openids: string[]; add_to_member_blacklist?: boolean }): Promise<unknown>
  getJoinRequestList(groupOpenid: string, params?: { cursor?: string; limit?: number }): Promise<{ list?: JoinRequest[]; next_cursor?: string }>
  approveJoinRequest(groupOpenid: string, memberOpenid: string, data: {
    op: 'approve' | 'decline'
    join_request_id: string
    reject_reason?: string
    add_to_member_blacklist?: boolean
  }): Promise<unknown>
  getRestrictChatSetting(groupOpenid: string): Promise<RestrictChatSetting>
  setRestrictChatSetting(groupOpenid: string, data: {
    members: { op: 'add' | 'update' | 'del'; member_openid: string; mute_expire_at?: string }[]
  }): Promise<unknown>
  getMenu(): Promise<{ version?: number; menu?: Menu }>
  setMenu(data: { menu: Menu }): Promise<{ version: number }>
  getPanels(params: { scope: string; cursor?: string; limit?: number }): Promise<PanelList>
  createPanel(data: { scope: string; target_type?: string; panel: { items: PanelItem[]; remark?: string } }): Promise<{ panel_id: string }>
  modifyPanel(panelId: string, data: { panel: { items: PanelItem[]; remark?: string } }): Promise<{ version: number }>
  deletePanel(panelId: string): Promise<unknown>
  getPanel(panelId: string): Promise<PanelRecord>
}

export interface GuildInternal extends Internal {
  getMe(): Promise<User>
  getGuilds(params?: { before?: string; after?: string; limit?: number }): Promise<Guild[]>
  getGuild(guildId: string): Promise<Guild>
  getChannels(guildId: string): Promise<GuildChannel[]>
  getChannel(channelId: string): Promise<GuildChannel>
  getGuildMembers(guildId: string, params?: { after?: string; limit?: number }): Promise<GuildMember[]>
  getGuildMember(guildId: string, userId: string): Promise<GuildMember>
  getMessage(channelId: string, messageId: string): Promise<{ message: GuildMessage }>
  sendMessage(channelId: string, data: ChannelSendRequest): Promise<SendResponse>
  sendDM(guildId: string, data: ChannelSendRequest): Promise<SendResponse>
  createDMS(data: { recipient_id: string; source_guild_id?: string }): Promise<{ guild_id: string; channel_id: string }>
}

type Routes = Record<string, Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', string | string[]>>>

/** Group and C2C endpoints, and those of the bot itself (Koishi adapter-qq-crack, internal/group.ts) */
const GROUP_ROUTES: Routes = {
  '/v2/groups/{channel.id}/messages': { POST: 'sendMessage' },
  '/v2/groups/{channel.id}/messages/{message.id}': { DELETE: 'deleteMessage' },
  '/v2/users/{user.id}/messages': { POST: 'sendPrivateMessage' },
  '/v2/users/{user.id}/messages/{message.id}': { DELETE: 'deletePrivateMessage' },
  '/v2/users/{user.id}/files': { POST: ['sendFilePrivate', 'completeUploadPrivate'] },
  '/v2/groups/{channel.id}/files': { POST: ['sendFileGuild', 'completeUploadGuild'] },
  '/v2/users/{user.id}/upload_prepare': { POST: 'uploadPreparePrivate' },
  '/v2/users/{user.id}/upload_part_finish': { POST: 'uploadPartFinishPrivate' },
  '/v2/groups/{channel.id}/upload_prepare': { POST: 'uploadPrepareGuild' },
  '/v2/groups/{channel.id}/upload_part_finish': { POST: 'uploadPartFinishGuild' },
  '/gateway': { GET: 'getGateway' },
  '/gateway/bot': { GET: 'getGatewayBot' },
  '/interactions/{interaction.id}': { PUT: 'acknowledgeInteraction' },
  '/v2/groups/{group.openid}/info': { GET: 'getGroupInfo' },
  '/v2/groups/{group.openid}/bot_state': { GET: 'getBotGroupState' },
  '/v2/groups/{group.openid}/members': { GET: 'getGroupMembers' },
  '/v2/groups/{group.openid}/members/{member.openid}': { GET: 'getGroupMember' },
  '/v2/groups/{group.openid}/batch_remove_members': { POST: 'batchRemoveGroupMembers' },
  '/v2/groups/{group.openid}/member_blacklist': { GET: 'getGroupMemberBlacklist', POST: 'modifyGroupMemberBlacklist' },
  '/v2/groups/{group.openid}/join_request_list': { GET: 'getJoinRequestList' },
  '/v2/groups/{group.openid}/approval_join_request/{member.openid}': { POST: 'approveJoinRequest' },
  '/v2/groups/{group.openid}/restrict_chat_setting': { GET: 'getRestrictChatSetting', POST: 'setRestrictChatSetting' },
  '/v2/groups/join_approval_strategy': { GET: 'getJoinApprovalStrategyList', POST: 'createJoinApprovalStrategy' },
  '/v2/groups/join_approval_strategy/{strategy.id}': { PATCH: 'modifyJoinApprovalStrategy', DELETE: 'deleteJoinApprovalStrategy' },
  '/v2/groups/join_approval_strategy/{strategy.id}/execute': { POST: 'executeJoinApprovalStrategy' },
  '/v2/groups/join_approval_strategy/{strategy.id}/whitelist_users': { POST: 'modifyJoinApprovalStrategyWhitelist' },
  '/v2/menu': { GET: 'getMenu', PUT: 'setMenu' },
  '/v2/panels': { GET: 'getPanels', POST: 'createPanel' },
  '/v2/panels/{panel.id}': { GET: 'getPanel', PUT: 'modifyPanel', DELETE: 'deletePanel' },
  '/v2/panels/{panel.id}/target': { PUT: 'modifyPanelTarget' },
  '/v2/generate_url_link': { POST: 'generateUrlLink' },
}

/** Guild endpoints (Koishi adapter-qq-crack, internal/guild.ts) */
const GUILD_ROUTES: Routes = {
  '/users/@me': { GET: 'getMe' },
  '/users/@me/guilds': { GET: 'getGuilds' },
  '/guilds/{guild.id}': { GET: 'getGuild' },
  '/guilds/{guild.id}/channels': { GET: 'getChannels', POST: 'createGuildChannel' },
  '/channels/{channel.id}': { GET: 'getChannel', PATCH: 'modifyChannel', DELETE: 'deleteChannel' },
  '/channels/{channel.id}/online_nums': { GET: 'getChannelOnlineNums' },
  '/channels/{channel.id}/mic': { PUT: 'setChannelMic', DELETE: 'removeChannelMic' },
  '/channels/{channel.id}/audio': { POST: 'controlChannelAudio' },
  '/guilds/{guild.id}/members': { GET: 'getGuildMembers' },
  '/guilds/{guild.id}/roles/{role.id}/members': { GET: 'getGuildRoleMembers' },
  '/guilds/{guild.id}/members/{user.id}': { GET: 'getGuildMember', DELETE: 'removeGuildMember' },
  '/guilds/{guild.id}/roles': { GET: 'getGuildRoles', POST: 'createGuildRole' },
  '/guilds/{guild.id}/roles/{role.id}': { PATCH: 'modifyGuildRole', DELETE: 'removeGuildRole' },
  '/guilds/{guild.id}/members/{user.id}/roles/{role.id}': { PUT: 'addGuildMemberRole', DELETE: 'removeGuildMemberRole' },
  '/channels/{channel.id}/members/{user.id}/permissions': { GET: 'getChannelMemberPermissions', PUT: 'modifyChannelMemberPermissions' },
  '/channels/{channel.id}/roles/{role.id}/permissions': { GET: 'getChannelRole', PUT: 'modifyChannelRole' },
  '/channels/{channel.id}/messages/{message.id}': { GET: 'getMessage', DELETE: 'deleteMessage' },
  '/channels/{channel.id}/messages': { POST: 'sendMessage' },
  '/dms/{guild.id}/messages': { POST: 'sendDM' },
  '/guilds/{guild.id}/message/setting': { GET: 'getMessageSetting' },
  '/users/@me/dms': { POST: 'createDMS' },
  '/dms/{guild.id}/messages/{message.id}': { DELETE: 'deleteDM' },
  '/guilds/{guild.id}/mute': { PATCH: 'muteGuildOrMembers' },
  '/guilds/{guild.id}/members/{user.id}/mute': { PATCH: 'muteGuildMember' },
  '/guilds/{guild.id}/announces': { POST: 'createGuildAnnounce' },
  '/guilds/{guild.id}/announces/{message.id}': { DELETE: 'removeGuildAnnounce' },
  '/channels/{channel.id}/pins/{message.id}': { PUT: 'createPinsMessage', DELETE: 'removePinsMessage' },
  '/channels/{channel.id}/pins': { GET: 'getPinsMessage' },
  '/channels/{channel.id}/schedules': { GET: 'getSchedules', POST: 'createSchedule' },
  '/channels/{channel.id}/schedules/{schedule.id}': { GET: 'getSchedule', PATCH: 'modifySchedule', DELETE: 'removeSchedule' },
  '/channels/{channel.id}/messages/{message.id}/reactions/{type}/{id}': { PUT: 'createReaction', DELETE: 'deleteReaction', GET: 'getReactions' },
  '/channels/{channel.id}/threads': { GET: 'listThreads', PUT: 'createPost' },
  '/channels/{channel.id}/threads/{thread.id}': { GET: 'getThread', DELETE: 'removePost' },
  '/guilds/{guild.id}/api_permission': { GET: 'getGuildApiPermissions' },
  '/guilds/{guild.id}/api_permission/demand': { POST: 'createGuildApiPermissionDemand' },
}

function define<T extends Internal>(api: QQOfficialApi, routes: Routes): T {
  const internal: Internal = {}
  for (const [path, methods] of Object.entries(routes)) {
    for (const [method, names] of Object.entries(methods)) {
      for (const name of [names!].flat()) {
        internal[name] = async (...args: unknown[]) => {
          const raw = args.join(', ')
          const url = path.replace(/\{[^}]+\}/g, () => {
            if (!args.length) throw new Error(`${name}: too few arguments for ${path}, received ${raw}`)
            return encodeURIComponent(String(args.shift()))
          })
          const query = method === 'GET' || method === 'DELETE'
          if (args.length > (query ? 1 : 2)) throw new Error(`${name}: too many arguments for ${path}, received ${raw}`)
          const [first, second] = args as [any, any]
          return query
            ? api.request(method, url, undefined, { params: first })
            : api.request(method, url, first, { params: second })
        }
      }
    }
  }
  return internal as T
}

export const groupInternal = (api: QQOfficialApi) => define<GroupInternal>(api, GROUP_ROUTES)

export const guildInternal = (api: QQOfficialApi) => define<GuildInternal>(api, GUILD_ROUTES)
