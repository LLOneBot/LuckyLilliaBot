import h from '@satorijs/element'
import type { NeutralResource } from '@luckylillia/plugin-sdk'
import { privateTarget } from './decode'
import { fallback } from '../../../../universal/fallback'
import {
  cardMarkdown, CustomPayload, decodeButton, escapeMarkdown, extractMarkdownText, isWebUrl, parseArkElement, parseCardElement,
  parseCustomElement, splitDataImages, textToMarkdown,
} from './elements'
import { loadMedia, uploadMedia, webImageSize } from './media'
import { Button, ChannelSendRequest, FileType, MessageType, SendRequest } from './types'
import type { DeliverOptions, QQGuildClient, QQOfficialBot } from './bot'

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
  // Where the line break closing the last paragraph ends; dropped if nothing follows, as the NT encoder does
  private paragraphEnd = -1
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
    if (type === 'card') return this.card(element)
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
      this.paragraphEnd = this.content.length
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
      // As the NT encoder writes it; the client makes the link clickable
      const text = extractMarkdownText(children)
      this.appendText(attrs.href && text && text !== attrs.href ? `${text} ( ${attrs.href} )` : attrs.href || text)
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
    this.content = textToMarkdown(this.content)
    this.useMarkdown = true
  }

  protected async sendCustom(payload: CustomPayload) {
    await this.flush()
    this.custom = payload
    await this.flush()
  }

  /** As ark 24 (with an image) or 23; the fallback when it lacks a title or a link */
  protected async card(element: h) {
    const card = parseCardElement(element)
    return card ? this.sendCustom({ request: card }) : this.render(fallback(element))
  }

  /** Markdown on lines of its own, as a paragraph is */
  protected appendBlock(markdown: string, markup: string) {
    if (this.plain && !this.plain.endsWith('\n')) this.appendText('\n')
    this.enterMarkdown()
    this.content += markdown + '\n'
    this.plain += markdown + '\n'
    this.markup += markup
    this.paragraphEnd = this.content.length
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

  /** Called first thing by flush(). */
  protected dropParagraphBreak() {
    if (this.paragraphEnd !== this.content.length || !this.content.endsWith('\n')) return
    this.content = this.content.slice(0, -1)
    this.plain = this.plain.replace(/\n$/, '')
    this.markup = this.markup.replace(/\n$/, '')
  }

  protected resetMessage() {
    this.paragraphEnd = -1
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
  private fileMarkup = ''
  // The text holds <qqbot-at-everyone />, which a medium's text does not render
  private tagged = false
  private readonly direct: boolean

  constructor(private bot: QQOfficialBot, private channelId: string, private replyTo?: string) {
    super()
    this.direct = privateTarget(channelId) !== undefined
  }

  protected mention(attrs: Record<string, any>): string {
    if (this.direct) return attrs.name ? `@${attrs.name}` : ''
    // Text or markdown; only as an admin, once a day per group (bot.q.qq.com changelog, 2026-10-26)
    if (attrs.type === 'all') {
      this.tagged = true
      return '<qqbot-at-everyone />'
    }
    if (!attrs.id || attrs.id === this.bot.selfId) return ''
    // A group renders it in markdown only (bot.q.qq.com 文本交互); <@openid> is being retired
    if (this.bot.config.useMarkdownIfAt) {
      this.enterMarkdown()
      return `<qqbot-at-user id="${attrs.id}" />`
    }
    const name = attrs.name ?? this.bot.names.get(this.bot.platform, attrs.id)
    return name ? `@${name}` : ''
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
    this.fileMarkup = h(MEDIA_TAGS[fileType], { src }).toString()
    if (fileType !== FileType.Image) await this.flush()
    return true
  }

  // Ark templates take an application, markdown is open to every bot (bot.q.qq.com, 2026-04). An image that is not
  // on the web cannot go into markdown: it follows as a medium
  protected async card(element: h) {
    const image = element.attrs.image
    const web = typeof image === 'string' && isWebUrl(image)
    const markdown = cardMarkdown(element.attrs, web ? await webImageSize(image) : undefined)
    if (markdown) this.appendBlock(markdown, element.toString())
    if (image && !web) await this.media('img', { src: image })
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

  protected resetMessage() {
    super.resetMessage()
    this.file = undefined
    this.fileMarkup = ''
    this.tagged = false
  }

  protected async flush() {
    this.dropParagraphBreak()
    const rows = this.exportRows()
    const { content, plain, markup, custom, fileMarkup, useMarkdown, plainTextOnly, tagged } = this
    let { file } = this
    this.resetMessage()
    // A medium carries plain text only: markdown, buttons or a mention after it go out on their own
    if (file && (useMarkdown || tagged)) {
      await this.post({ msg_type: MessageType.Media, media: { file_info: file } }, fileMarkup)
      file = undefined
    }
    if (!plain.trim() && !rows.length && !file && !custom) return
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
    await this.post(body, (file ? fileMarkup : '') + markup, {
      streamText: !custom && !file && !useMarkdown && plainTextOnly && this.bot.config.autoStreamText.includes(streamTarget),
      autoStream: !!custom?.autoStream,
      endStream: custom?.autoStream === 'end',
    })
  }

  private async post(body: SendRequest, markup: string, options: Pick<DeliverOptions, 'streamText' | 'autoStream' | 'endStream'> = {}) {
    const quote = this.quote
    this.quote = undefined
    try {
      this.results.push(await this.bot.deliver(this.channelId, body, { ...options, quote, markup, passive: this.passive, replyTo: this.replyTo }))
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

  constructor(private bot: QQGuildClient, private channelId: string, private replyTo?: string) {
    super()
    this.direct = channelId.includes('_')
  }

  protected mention(attrs: Record<string, any>): string {
    if (attrs.type === 'all') return '@everyone'
    if (!attrs.id || attrs.id === this.bot.selfId) return ''
    return `<@${attrs.id}>`
  }

  protected async visit(element: h) {
    const embedded = element.type === 'sharp' && element.attrs.id ? `<#${element.attrs.id}>`
      : element.type === 'face' && element.attrs.id ? `<emoji:${element.attrs.id}>` : undefined
    if (embedded) {
      this.content += embedded
      this.plain += embedded
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
    this.dropParagraphBreak()
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
        replyTo: this.replyTo,
        file,
        fileUrl,
        streamText: !custom && !file && !fileUrl && !useMarkdown && plainTextOnly && this.bot.config.autoStreamText.includes('guild'),
        autoStream: !!custom?.autoStream,
        endStream: custom?.autoStream === 'end',
      }))
    } catch (e) {
      this.errors.push(e as Error)
    }
  }
}
