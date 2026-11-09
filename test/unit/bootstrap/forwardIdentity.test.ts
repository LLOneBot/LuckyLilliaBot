import type { Context } from 'cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rawElementsToSend } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/helper/forwardMsg'
import { SendElement } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/entities'
import { ChatType, type MessageElement } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'

vi.mock('@/common/utils', async (original) => ({
  ...await original<typeof import('@/common/utils')>(),
  uri2local: async () => ({ success: true, isLocal: true, path: '/local/file' }),
}))
afterEach(() => vi.restoreAllMocks())

describe('NT forwarded message identity', () => {
  it('retains the source login when a previous attachment finishes after identity changes', async () => {
    const picture = Promise.withResolvers<string>()
    const selfInfo = { uid: 'u_original' }
    const getFileUrl = vi.fn(async () => ({ url: 'file:///file' }))
    const ctx = {
      qqProtocol: { selfInfo },
      ntFileApi: { getImageUrl: () => picture.promise, getFileUrl },
    } as unknown as Context
    vi.spyOn(SendElement, 'pic').mockResolvedValue({} as never)
    vi.spyOn(SendElement, 'file').mockResolvedValue({} as never)
    const forwarding = rawElementsToSend(ctx, [
      { picElement: { originImageUrl: '', md5HexStr: 'md5', fileUuid: 'picture' } },
      { fileElement: { fileUuid: 'file', fileName: 'file' } },
    ] as MessageElement[], { chatType: ChatType.C2C, peerUid: 'u_peer' })
    selfInfo.uid = 'u_new'
    picture.resolve('file:///picture')
    await forwarding
    expect(getFileUrl).toHaveBeenCalledExactlyOnceWith('file', false, 'u_original')
  })
})
