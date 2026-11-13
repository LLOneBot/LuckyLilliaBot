import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindContext } from '@/plugin/internal/tool/webqq/client/context'
import { getAudioBlob } from '@/plugin/internal/tool/webqq/client/utils/webqqApi'

describe('WebQQ audio request feedback', () => {
  const fetchAudio = vi.fn()
  beforeEach(() => {
    bindContext({ fetch: fetchAudio } as any)
  })

  it('preserves the backend install instruction for the playback toast', async () => {
    const message = '未安装或未启用 FFmpeg 插件（lucky-lillia-plugin-ffmpeg），请安装并启用后重试'
    fetchAudio.mockResolvedValue(Response.json({ success: false, code: 'FFMPEG_PLUGIN_MISSING', message }, { status: 503 }))
    await expect(getAudioBlob('voice-id', true)).rejects.toThrow(message)
    expect(fetchAudio).toHaveBeenCalledOnce()
  })

  it('fetches playable audio once through the SDK with cancellation and escaped file parameters', async () => {
    fetchAudio.mockResolvedValue(new Response('voice', { headers: { 'Content-Type': 'audio/wav' } }))
    const controller = new AbortController()
    const result = await getAudioBlob('id&1', false, 'D:/语音/test.wav', controller.signal)
    expect(result.type).toBe('audio/wav')
    expect(await result.text()).toBe('voice')
    expect(fetchAudio).toHaveBeenCalledOnce()
    const [url, options] = fetchAudio.mock.calls[0]
    const params = new URL(url, 'http://localhost').searchParams
    expect(params.get('fileUuid')).toBe('id&1')
    expect(params.get('filePath')).toBe('D:/语音/test.wav')
    expect(params.has('token')).toBe(false)
    expect(options.signal).toBe(controller.signal)
  })

  it('shows a readable fallback for a non-JSON server error', async () => {
    fetchAudio.mockResolvedValue(new Response('Bad Gateway', { status: 502 }))
    await expect(getAudioBlob('voice-id', false)).rejects.toThrow('获取语音失败，请重试')
  })
})
