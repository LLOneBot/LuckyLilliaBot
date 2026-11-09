import h from '@satorijs/element'
import type { Context } from 'cordis'
import { isGuildId, rawGuildId } from './guildIds'
import type { Stream } from './types'

const MEDIA: Record<string, string> = {
  img: '[图片]', image: '[图片]', audio: '[语音]', video: '[视频]', file: '[文件]',
  face: '[表情]', quote: '[引用]', card: '[卡片]', message: '[合并转发]',
}

/** Keep regular logs readable; attachment URLs, base64 and platform payload attributes stay out. */
export function messageSummary(content: string): string {
  const plain = (elements: h[]): string => elements.map((element) => {
    if (element.type === 'text') return element.attrs.content
    if (typeof MEDIA[element.type] === 'string') return MEDIA[element.type]
    if (element.type === 'at') return `@${element.attrs.name || element.attrs.id || '全体成员'}`
    if (element.type === 'sharp') return `#${element.attrs.name || element.attrs.id || '频道'}`
    if (element.type === 'br') return ' '
    if (element.type === 'markdown') {
      const markdown = element.attrs.content || plain(element.children)
      return '[Markdown]' + markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    }
    if (element.type.startsWith('qq:')) return '[平台消息]'
    if (element.type === 'button') return '[按钮]' + plain(element.children)
    return plain(element.children) + (element.type === 'p' ? ' ' : '')
  }).join('')
  const summary = plain(h.parse(content)).replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim()
  return summary.length > 300 ? summary.slice(0, 300) + '…' : summary || '[消息]'
}

export function logMessage(
  ctx: Context, direction: '收' | '发', channelId: string, content: string,
  user?: { id?: string; name?: string }, stream?: Stream,
) {
  // A streaming response is one message: only its first successful part gets a regular log.
  if (stream?.id || (stream?.index ?? 0) > 0) return
  const direct = channelId.startsWith('private:')
  const guild = isGuildId(channelId)
  const kind = guild ? direct ? '频道私信' : '频道' : direct ? '私' : '群'
  const target = guild ? rawGuildId(channelId) : direct ? channelId.slice('private:'.length) : channelId
  const sender = user?.name ? ` ${user.name}(${user.id ?? ''})` : user?.id ? ` ${user.id}` : ''
  ctx.logger('qq-official').info('[%s-%s] %s%s%s：%s', direction, kind, target, sender, stream ? ' (流式回复)' : '', messageSummary(content))
}
