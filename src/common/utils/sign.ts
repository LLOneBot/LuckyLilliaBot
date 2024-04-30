import { log } from './log'

export interface IdMusicSignPostData {
  type: 'qq' | '163'
  id: string | number
}

export interface CustomMusicSignPostData {
  type: 'custom'
  url: string
  audio: string
  title: string
  image?: string
  singer?: string
}

export type MusicSignPostData = IdMusicSignPostData | CustomMusicSignPostData

export class MusicSign {
  private readonly url: string

  constructor(url: string) {
    this.url = url
  }

  async sign(postData: MusicSignPostData): Promise<string> {
    const resp = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postData),
    })
    if (!resp.ok) throw new Error(resp.statusText)
    const data = await resp.text()
    log('音乐消息生成成功', data)
    return data
  }
}
