export type MusicPlatform = 'qq' | '163' | 'kugou' | 'kuwo' | 'migu'

export interface IdMusicCardData {
  type: MusicPlatform
  id: string | number
}

export interface CustomMusicCardData {
  type: MusicPlatform | 'custom'
  /** Jump URL */
  url: string
  audio: string
  title: string
  content?: string
  image?: string
  singer?: string
  /** Which platform a custom card shows as; QQ Music when left out. */
  subtype?: MusicPlatform
}

export type MusicCardData = IdMusicCardData | CustomMusicCardData

interface Song {
  title: string
  desc: string
  cover: string
  jumpUrl: string
  musicUrl: string
}

const PLATFORMS: Record<MusicPlatform, { appid: number; tag: string }> = {
  qq: { appid: 100497308, tag: 'QQ音乐' },
  '163': { appid: 100495085, tag: '网易云音乐' },
  kugou: { appid: 205141, tag: '酷狗音乐' },
  kuwo: { appid: 100243533, tag: '酷我音乐' },
  migu: { appid: 1101053067, tag: '咪咕音乐' },
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0' }

/**
 * An unsigned music card (ark). Core.sendMessage has it signed with every other card; the sign service reads
 * meta.music and extra.appid (docs/card-message-sign.md).
 */
export async function buildMusicCard(data: MusicCardData): Promise<string> {
  const platform = 'id' in data ? data.type : data.subtype ?? (data.type === 'custom' ? 'qq' : data.type)
  const target = PLATFORMS[platform]
  if (!target) throw new Error(`不支持的音乐平台 ${platform}`)
  const { appid, tag } = target
  const song: Song = 'id' in data
    ? await lookupSong(data.type, String(data.id))
    : { title: data.title, desc: data.content ?? data.singer ?? '', cover: data.image ?? '', jumpUrl: data.url, musicUrl: data.audio }
  return JSON.stringify({
    app: 'com.tencent.music.lua',
    bizsrc: 'qqconnect.sdkshare_music',
    view: 'music',
    ver: '0.0.0.1',
    prompt: `[分享]${song.title}`,
    config: { type: 'normal', forward: 1 },
    extra: { app_type: 1, appid },
    meta: {
      music: {
        app_type: 1,
        appid,
        title: song.title,
        desc: song.desc,
        jumpUrl: song.jumpUrl,
        musicUrl: song.musicUrl,
        preview: song.cover,
        tag,
      },
    },
  })
}

async function lookupSong(platform: MusicPlatform, id: string): Promise<Song> {
  if (platform === '163') return lookupNetease(id)
  if (platform === 'qq') return lookupQQ(id)
  throw new Error(`${PLATFORMS[platform].tag}只给 id 时查不到歌曲信息，请用 custom 写法给出标题、链接和音频地址`)
}

async function getJson(url: string): Promise<any> {
  const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) })
  if (!resp.ok) throw new Error(`查询歌曲信息失败：HTTP ${resp.status}`)
  return resp.json()
}

async function lookupNetease(id: string): Promise<Song> {
  const res = await getJson(`https://music.163.com/api/song/detail/?ids=${encodeURIComponent(`[${id}]`)}`)
  const song = res?.songs?.[0]
  if (!song) throw new Error(`网易云音乐查不到歌曲 ${id}`)
  return {
    title: song.name,
    desc: (song.artists ?? []).map((artist: { name: string }) => artist.name).join('/'),
    cover: song.album?.picUrl ?? '',
    jumpUrl: `https://music.163.com/#/song?id=${id}`,
    musicUrl: `https://music.163.com/song/media/outer/url?id=${id}.mp3`,
  }
}

function musicu(data: object): Promise<any> {
  return getJson(`https://u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(JSON.stringify(data))}`)
}

/** `id` is a numeric song id or a songmid. */
async function lookupQQ(id: string): Promise<Song> {
  const param = /^\d+$/.test(id) ? { song_id: Number(id) } : { song_mid: id }
  const res = await musicu({ songinfo: { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param } })
  const track = res?.songinfo?.data?.track_info
  if (!track?.mid) throw new Error(`QQ音乐查不到歌曲 ${id}`)
  const jumpUrl = `https://i.y.qq.com/v8/playsong.html?songmid=${track.mid}`
  return {
    title: track.name,
    desc: (track.singer ?? []).map((singer: { name: string }) => singer.name).join('/'),
    cover: track.album?.mid ? `https://y.qq.com/music/photo_new/T002R300x300M000${track.album.mid}.jpg` : '',
    jumpUrl,
    // Without a logged-in vkey most songs get no stream URL: the card then opens the song page instead
    musicUrl: await qqStreamUrl(track.mid).catch(() => '') || jumpUrl,
  }
}

async function qqStreamUrl(mid: string): Promise<string> {
  const res = await musicu({
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: { guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20' },
    },
    comm: { uin: 0, format: 'json', ct: 24, cv: 0 },
  })
  const purl = res?.req_0?.data?.midurlinfo?.[0]?.purl
  const host = res?.req_0?.data?.sip?.[0]
  return purl && host ? host + purl : ''
}
