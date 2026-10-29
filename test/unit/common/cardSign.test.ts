import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasCardToken, signCard, signCards } from '@/common/utils/sign'
import { buildMusicCard, requestMusicCard } from '@/common/utils/musicCard'
import { ElementType, SendMessageElement } from '@/plugin/internal/protocol/nt-protocol/ntqqapi/types'

const unsigned = JSON.stringify({ app: 'com.tencent.tianxuan.share', config: { type: 'normal', forward: 1 } })
const signed = JSON.stringify({ app: 'com.tencent.tianxuan.share', config: { type: 'normal', forward: 1, ctime: 1, token: 'abc' } })

function serve(status: number, body: string) {
  const fetch = vi.fn(async () => new Response(body, { status }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('signCard', () => {
  it('tells a signed card by its token', () => {
    expect(hasCardToken(signed)).toBe(true)
    expect(hasCardToken(unsigned)).toBe(false)
    expect(hasCardToken('not json')).toBe(false)
  })

  it('posts the card JSON as is and takes the signed card back', async () => {
    const fetch = serve(200, signed)
    expect(await signCard('https://sign.test/card', unsigned)).toBe(signed)
    expect(fetch).toHaveBeenCalledWith('https://sign.test/card', expect.objectContaining({ method: 'POST', body: unsigned }))
  })

  it('leaves a card that already has a token alone', async () => {
    const fetch = serve(200, signed)
    expect(await signCard('https://sign.test/card', signed)).toBe(signed)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails with what the service said, and on a reply without a token', async () => {
    serve(400, 'no permission')
    await expect(signCard('https://sign.test/card', unsigned)).rejects.toThrow('卡片消息签名失败：no permission')
    serve(200, unsigned)
    await expect(signCard('https://sign.test/card', unsigned)).rejects.toThrow('没有 token')
  })

  it('signs every card of a message, inside a merged forward too', async () => {
    const ark = (data: string): SendMessageElement => ({ elementType: ElementType.Ark, arkElement: { bytesData: data } })
    const inner = ark('inner')
    const elements = [
      { elementType: ElementType.Text, textElement: { content: 'hi' } } as SendMessageElement,
      ark('outer'),
      { elementType: ElementType.MultiForward, multiForwardMsgElement: { nodes: [{ senderUin: 1, senderName: 'a', msgSeq: 1, elements: [inner] }] } } as SendMessageElement,
    ]
    await signCards(elements, async json => `${json}:signed`)
    expect((elements[1] as { arkElement: { bytesData: string } }).arkElement.bytesData).toBe('outer:signed')
    expect((inner as { arkElement: { bytesData: string } }).arkElement.bytesData).toBe('inner:signed')
  })
})

describe('buildMusicCard', () => {
  const music = (json: string) => JSON.parse(json).meta.music

  it('builds an unsigned card from a custom one, as QQ Music unless told otherwise', async () => {
    const card = JSON.parse(await buildMusicCard({ type: 'custom', url: 'https://j', audio: 'https://a.mp3', title: '晴天', content: '周杰伦', image: 'https://c.jpg' }))
    expect(card).toMatchObject({ app: 'com.tencent.music.lua', view: 'music', prompt: '[分享]晴天', extra: { appid: 100497308 } })
    expect(card.config.token).toBeUndefined()
    expect(card.meta.music).toMatchObject({ title: '晴天', desc: '周杰伦', jumpUrl: 'https://j', musicUrl: 'https://a.mp3', preview: 'https://c.jpg', tag: 'QQ音乐' })
    expect(music(await buildMusicCard({ type: 'custom', url: 'u', audio: 'a', title: 't', subtype: '163' })).tag).toBe('网易云音乐')
  })

  it('refuses a platform it does not know', async () => {
    await expect(buildMusicCard({ type: 'custom', url: 'u', audio: 'a', title: 't', subtype: 'spotify' as never })).rejects.toThrow('不支持的音乐平台')
  })

  it('looks a NetEase song up by id', async () => {
    serve(200, JSON.stringify({ code: 200, songs: [{ name: '晴天', artists: [{ name: '周杰伦' }], album: { picUrl: 'https://p.jpg' } }] }))
    expect(music(await buildMusicCard({ type: '163', id: 186016 }))).toMatchObject({
      title: '晴天',
      desc: '周杰伦',
      preview: 'https://p.jpg',
      jumpUrl: 'https://music.163.com/#/song?id=186016',
      musicUrl: 'https://music.163.com/song/media/outer/url?id=186016.mp3',
    })
  })

  it('asks for a custom card where an id cannot be looked up', async () => {
    await expect(buildMusicCard({ type: 'kugou', id: 1 })).rejects.toThrow('请用 custom 写法')
  })
})

describe('requestMusicCard', () => {
  const service = 'https://music.test/card'

  /** Answers each URL by the first handler whose prefix it starts with, and records what was posted. */
  function route(handlers: Record<string, () => Response>) {
    const posted: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.body) posted.push(JSON.parse(String(init.body)))
      const prefix = Object.keys(handlers).find(key => url.startsWith(key))
      if (!prefix) throw new Error(`unexpected fetch ${url}`)
      return handlers[prefix]()
    }))
    return posted
  }

  it('posts the song parameters and takes the signed card back', async () => {
    const posted = route({ [service]: () => new Response(signed) })
    expect(await requestMusicCard(service, { type: '163', id: 1330348068 })).toBe(signed)
    expect(posted).toEqual([{ type: '163', id: 1330348068 }])
  })

  it('treats a 200 without a card as the refusal it is', async () => {
    route({ [service]: () => new Response('关闭id解析功能') })
    await expect(requestMusicCard(service, { type: '163', id: 1 })).rejects.toThrow('关闭id解析功能')
  })

  it('looks a QQ Music id up and sends it the custom way', async () => {
    const posted = route({
      'https://u.y.qq.com/': () => new Response(JSON.stringify({
        songinfo: { data: { track_info: { name: '晴天', mid: 'm1', singer: [{ name: '周杰伦' }], album: { mid: 'a1' } } } },
        req_0: { data: { midurlinfo: [{ purl: '' }] } },
      })),
      [service]: () => new Response(signed),
    })
    await requestMusicCard(service, { type: 'qq', id: 97773 })
    expect(posted.at(-1)).toMatchObject({ type: 'custom', title: '晴天', singer: '周杰伦', url: 'https://i.y.qq.com/v8/playsong.html?songmid=m1' })
  })

  it('fills both singer and content of a custom card', async () => {
    const posted = route({ [service]: () => new Response(signed) })
    await requestMusicCard(service, { type: 'custom', url: 'u', audio: 'a', title: 't', content: '歌手' })
    expect(posted[0]).toMatchObject({ singer: '歌手', content: '歌手' })
  })
})
