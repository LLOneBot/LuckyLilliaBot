import { describe, expect, it, vi } from 'vitest'
import type { QQOfficialApi } from '@/plugin/internal/protocol/qq-official/api'
import { groupInternal, guildInternal } from '@/plugin/internal/protocol/qq-official/internal'

function fakeApi() {
  const request = vi.fn(async () => ({ ok: true }))
  return { api: { request } as unknown as QQOfficialApi, request }
}

describe('internal endpoints', () => {
  it('fills path parameters in order, encoded, then takes the body and its query', async () => {
    const { api, request } = fakeApi()
    const internal = groupInternal(api)
    await internal.approveJoinRequest('G 1', 'U/2', { op: 'approve', join_request_id: 'J' })
    expect(request).toHaveBeenLastCalledWith('POST', '/v2/groups/G%201/approval_join_request/U%2F2', { op: 'approve', join_request_id: 'J' }, { params: undefined })
    await internal.getJoinRequestList('G1', { cursor: 'c', limit: 10 })
    expect(request).toHaveBeenLastCalledWith('GET', '/v2/groups/G1/join_request_list', undefined, { params: { cursor: 'c', limit: 10 } })
    await internal.executeJoinApprovalStrategy('S1')
    expect(request).toHaveBeenLastCalledWith('POST', '/v2/groups/join_approval_strategy/S1/execute', undefined, { params: undefined })
  })

  it('refuses too few or too many arguments', async () => {
    const { api } = fakeApi()
    const internal = guildInternal(api)
    await expect(internal.getGuild()).rejects.toThrow('too few arguments')
    await expect(internal.getGuild('a', {}, {})).rejects.toThrow('too many arguments')
  })

  it('names the guild endpoints like Koishi does', async () => {
    const { api, request } = fakeApi()
    const internal = guildInternal(api)
    // An emoji reaction is named by the emoji itself
    const grin = String.fromCodePoint(0x1F600)
    await internal.createReaction('C1', 'M1', 2, grin)
    expect(request).toHaveBeenLastCalledWith('PUT', `/channels/C1/messages/M1/reactions/2/${encodeURIComponent(grin)}`, undefined, { params: undefined })
    await internal.sendDM('DMG', { content: 'hi' })
    expect(request).toHaveBeenLastCalledWith('POST', '/dms/DMG/messages', { content: 'hi' }, { params: undefined })
  })
})
