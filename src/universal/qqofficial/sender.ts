import h from '@satorijs/element'
import type { NeutralResource } from '@luckylillia/plugin-sdk'
import { privateTarget } from './decode'
import { CustomPayload, decodeButton, escapeMarkdown, extractMarkdownText, parseArkElement, parseCustomElement, splitDataImages } from './elements'
import { loadMedia, uploadMedia } from './media'
import { Button, ChannelSendRequest, FileType, MessageType, SendRequest } from './types'
import type { QQGuildBot, QQOfficialBot } from './bot'

const MEDIA_TYPES: Record<string, number> = {
  img: FileType.Image,
  image: FileType.Image,
  video: FileType.Video,
  audio: FileType.Audio,
  file: FileType.File,
}

const MEDIA_TAGS: Record<number, string> = {
  [FileType.Image]: 'img',
  [FileType.Video]: 'video',
  [FileType.Audio]: 'audio',
  [FileType.File]: 'file',
}

/** What a `<passive>` element pins a reply to, instead of the message or event picked automatically */
export interface PassiveOverride {
  messageId?: string
  seq?: number
  eventId?: string
}

/**
 * What both senders share: text that turns into markdown once a markdown element, a button or (by setting) a
 * mention shows up, rows of buttons, and the platform's own payloads, each sent as a message of its own.
 */
abstract class Encoder {
  // What goes out: plain text, or markdown once useMarkdown is set
  protected content = ''
  // The same unescaped, for a message that cannot be markdown after all
  protected plain = ''
  // The same as Satori markup, for the returned resource
  protected markup = ''
  protected useMarkdown = false
  // No element the stream setting has to keep its hands off
  protected plainTextOnly = true
  protected rows: Button[][] = []
  protected custom?: CustomPayload
  protected quote?: string
  protected passive: PassiveOverride = {}
  protected results: NeutralResource[] = []
  protected errors: Error[] = []

  async send(elements: h[]): Promise<NeutralResource[]> {
    await this.render(elements)
    await this.flush()
    if (this.errors.length === 1) throw this.errors[0]
    if (this.errors.length) throw new AggregateError(this.errors, this.errors.map(e => e.message).join('; '))
    return this.results
  }

  protected abstract flush(): Promise<void>
  protected abstract mention(attrs: Record<string, any>): string
  /** A medium; false when this sender does not take that kind */
  protected abstract media(type: string, attrs: Record<string, any>): Promise<boolean>
  protected abstract markdownElement(content: string): Promise<void>

  protected async render(elements: h[]) {
    for (const element of elements) await this.visit(element)
  }

  protected async visit(element: h) {
    const { type, attrs, children } = element
    if (type === 'markdown') {
      const content = typeof attrs.content === 'string' ? attrs.content : extractMarkdownText(children)
      // A streamed markdown element is a payload of its own, like <qq:rawmarkdown stream>
      if (attrs.stream !== undefined) return this.sendCustom(parseCustomElement(h('qq:rawmarkdown', { content, stream: attrs.stream }))!)
      return this.markdownElement(content)
    }
    if (type === 'button' || type === 'qq:button') {
      this.enterMarkdown()
      this.lastRow().push(decodeButton(attrs, extractMarkdownText(children)))
      return
    }
    if (type === 'button-group') {
      this.enterMarkdown()
      this.rows.push([])
      return this.render(children)
    }
    const ark = parseArkElement(element)
    if (ark) return this.sendCustom({ request: ark })
    const custom = parseCustomElement(element)
    if (custom) return this.sendCustom(custom)
    if (type === 'text') {
      this.appendText(attrs.content ?? '')
    } else if (type === 'br') {
      this.appendText('\n')
    } else if (type === 'p') {
      if (this.plain && !this.plain.endsWith('\n')) this.appendText('\n')
      await this.render(children)
      if (!this.plain.endsWith('\n')) this.appendText('\n')
    } else if (type === 'at') {
      const mention = this.mention(attrs)
      if (mention) {
        this.content += mention
        this.plain += mention
        this.markup += element.toString()
      }
    } else if (type === 'quote') {
      if (attrs.id) this.quote = attrs.id
    } else if (type === 'passive') {
      if (attrs.messageId) this.passive.messageId = String(attrs.messageId)
      if (attrs.seq) this.passive.seq = Number(attrs.seq)
      if (attrs.eventId) this.passive.eventId = String(attrs.eventId)
    } else if (type in MEDIA_TYPES && (attrs.src || attrs.url)) {
      if (!await this.media(type, attrs)) {
        this.plainTextOnly = false
        await this.render(children)
      }
    } else if (type === 'message') {
      await this.flush()
      await this.render(children)
      await this.flush()
    } else if (type === 'a') {
      // The link itself, which the client makes clickable
      this.appendText(attrs.href || extractMarkdownText(children))
    } else if (type === 'i' || type === 'em' || type === 'b' || type === 'strong') {
      await this.render(children)
    } else {
      this.plainTextOnly = false
      await this.render(children)
    }
  }

  protected appendText(text: string) {
    this.content += this.useMarkdown ? escapeMarkdown(text) : text
    this.plain += text
    this.markup += h.escape(text)
  }

  protected appendMarkdown(content: string) {
    if (!content) return
    this.enterMarkdown()
    this.content += content
    this.plain += content
    this.markup += h('markdown', {}, content).toString()
  }

  protected enterMarkdown() {
    this.plainTextOnly = false
    if (this.useMarkdown) return
    this.content = escapeMarkdown(this.content)
    this.useMarkdown = true
  }

  protected async sendCustom(payload: CustomPayload) {
    await this.flush()
    this.custom = payload
    await this.flush()
  }

  private lastRow(): Button[] {
    if (!this.rows.length) this.rows.push([])
    let last = this.rows[this.rows.length - 1]
    // At most five buttons a row
    if (last.length >= 5) this.rows.push(last = [])
    return last
  }

  protected exportRows() {
    while (this.rows.length && !this.rows[this.rows.length - 1].length) this.rows.pop()
    return this.rows.filter(row => row.length).map(buttons => ({ buttons }))
  }

  protected resetMessage() {
    this.content = ''
    this.plain = ''
    this.markup = ''
    this.useMarkdown = false
    this.plainTextOnly = true
    this.rows = []
    this.custom = undefined
  }
}

/**
 * Group and C2C messages. One message holds text plus at most one medium, shown above the text, so text
 * written before a medium goes out first; video, voice and files take no text at all.
 */
export class MessageSender extends Encoder {
  private file?: string
  private readonly direct: boolean

  constructor(private bot: QQOfficialBot, private channelId: string) {
    super()
    this.direct = privateTarget(channelId) !== undefined
  }

  protected mention(attrs: Record<string, any>): string {
    if (this.direct) return attrs.name ? `@${attrs.name}` : ''
    if (attrs.type !== 'all' && (!attrs.id || attrs.id === this.bot.selfId)) return ''
    if (!this.useMarkdown && this.bot.config.useMarkdownIfAt) this.enterMarkdown()
    if (this.useMarkdown) return attrs.type === 'all' ? '@everyone' : `<@${attrs.id}>`
    // Once a day per group, and only as an admin (bot.q.qq.com changelog, 2026-10-26)
    if (attrs.type === 'all') return '<qqbot-at-everyone />'
    return `<qqbot-at-user id="${attrs.id}" />`
  }

  protected async media(type: string, attrs: Record<string, any>): Promise<boolean> {
    const fileType = MEDIA_TYPES[type]
    const src: string = attrs.src ?? attrs.url
    this.plainTextOnly = false
    await this.flush()
    try {
      this.file = await uploadMedia(this.bot.ctx, this.bot.api, this.bot.target(this.channelId), fileType, src, attrs.title ?? attrs.name ?? attrs.filename)
    } catch (e) {
      this.errors.push(e as Error)
      return true
    }
    this.markup += h(MEDIA_TAGS[fileType], { src }).toString()
    if (fileType !== FileType.Image) await this.flush()
    return true
  }

  // Inline data: images cannot stay in markdown: they go out as media around the text
  protected async markdownElement(content: string) {
    const parts = splitDataImages(content)
    if (!parts) return this.appendMarkdown(content)
    for (const part of parts) {
      if (part.type === 'text') {
        if (this.file) await this.flush()
        this.appendMarkdown(part.content)
      } else {
        await this.media('img', { src: part.src })
      }
    }
  }

  protected async sendCustom(payload: CustomPayload) {
    const { request } = payload
    const content = request.markdown?.content
    if (request.msg_type === MessageType.Markdown && content && !request.keyboard && !request.stream && splitDataImages(content)) {
      return this.markdownElement(content)
    }
    return super.sendCustom(payload)
  }

  protected async flush() {
    const rows = this.exportRows()
    if (!this.plain.trim() && !rows.length && !this.file && !this.custom) {
      this.resetMessage()
      return
    }
    const { content, plain, markup, custom, file, useMarkdown, plainTextOnly } = this
    this.resetMessage()
    this.file = undefined
    let body: SendRequest
    if (custom) {
      body = { ...custom.request }
    } else if (file) {
      body = { msg_type: MessageType.Media, media: { file_info: file }, ...(plain.trim() ? { content: plain } : {}) }
    } else if (useMarkdown) {
      body = { msg_type: MessageType.Markdown, markdown: { content: content || ' ' }, ...(rows.length ? { keyboard: { content: { rows } } } : {}) }
    } else {
      body = { msg_type: MessageType.Text, content }
    }
    const streamTarget = this.direct ? 'private' : 'group'
    const quote = this.quote
    this.quote = undefined
    try {
      this.results.push(await this.bot.deliver(this.channelId, body, {
        quote,
        markup,
        passive: this.passive,
        streamText: !custom && !file && !useMarkdown && plainTextOnly && this.bot.config.autoStreamText.includes(streamTarget),
        autoStream: !!custom?.autoStream,
      }))
    } catch (e) {
      this.errors.push(e as Error)
    }
  }
}

/** Messages to a guild sub-channel, or a guild DM (`<dm guild>_<dm channel>`). */
export class GuildMessageSender extends Encoder {
  private file?: { data: Buffer; name: string }
  private fileUrl?: string
  private readonly direct: boolean

  constructor(private bot: QQGuildBot, private channelId: string) {
    super()
    this.direct = channelId.includes('_')
  }

  protected mention(attrs: Record<string, any>): string {
    if (attrs.type === 'all') return '@everyone'
    if (!attrs.id || attrs.id === this.bot.selfId) return ''
    return `<@${attrs.id}>`
  }

  protected async visit(element: h) {
    if (element.type === 'sharp' && element.attrs.id) {
      this.content += `<#${element.attrs.id}>`
      this.plain += `<#${element.attrs.id}>`
      this.markup += element.toString()
      return
    }
    return super.visit(element)
  }

  // Guilds take images only, one per message, after the text
  protected async media(type: string, attrs: Record<string, any>): Promise<boolean> {
    if (type !== 'img' && type !== 'image') return false
    const src: string = attrs.src ?? attrs.url
    await this.flush()
    try {
      if (/^https?:\/\//i.test(src)) this.fileUrl = src
      else this.file = await loadMedia(src)
    } catch (e) {
      this.errors.push(e as Error)
      return true
    }
    this.markup += h('img', { src }).toString()
    await this.flush()
    return true
  }

  protected async markdownElement(content: string) {
    this.appendMarkdown(content)
  }

  protected async flush() {
    const rows = this.exportRows()
    if (!this.plain.trim() && !rows.length && !this.file && !this.fileUrl && !this.custom) {
      this.resetMessage()
      return
    }
    const { content, markup, custom, file, fileUrl, useMarkdown, plainTextOnly } = this
    this.resetMessage()
    this.file = undefined
    this.fileUrl = undefined
    let data: ChannelSendRequest
    if (custom) {
      data = { ...custom.request }
      // A group / C2C medium has no meaning here
      delete (data as SendRequest).media
    } else if (useMarkdown && !file && !fileUrl) {
      data = { msg_type: MessageType.Markdown, markdown: { content: content || ' ' }, ...(rows.length ? { keyboard: { content: { rows } } } : {}) }
    } else {
      data = { content }
    }
    const quote = this.quote
    this.quote = undefined
    try {
      this.results.push(await this.bot.deliver(this.channelId, data, {
        quote,
        markup,
        passive: this.passive,
        file,
        fileUrl,
        streamText: !custom && !file && !fileUrl && !useMarkdown && plainTextOnly && this.bot.config.autoStreamText.includes('guild'),
        autoStream: !!custom?.autoStream,
      }))
    } catch (e) {
      this.errors.push(e as Error)
    }
  }
}
