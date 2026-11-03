import h from '@satorijs/element'
import { Ark, Button, Keyboard, Markdown, MessageType, SendRequest, Stream } from './types'

// The platform-specific elements (markdown, ark) and the button conversion

export type CustomRequest = Omit<SendRequest, 'msg_id' | 'msg_seq' | 'event_id'>

export interface CustomPayload {
  request: CustomRequest
  /** `stream` set to true, or to 'end' for the part that ends the stream: the stream bookkeeping fills in the fields */
  autoStream?: boolean | 'end'
}

type Attrs = Record<string, any>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')

/**
 * h() camelizes attribute names (`render_data` arrives as `renderData`), while the platform fields are snake_case:
 * both spellings are read. Nested objects keep their keys.
 */
function snakeAttrs(attrs: Attrs): Attrs {
  const result: Attrs = { ...attrs }
  for (const [key, value] of Object.entries(attrs)) {
    const snake = key.replace(/[A-Z]/g, char => '_' + char.toLowerCase())
    if (snake !== key && !(snake in result)) result[snake] = value
  }
  return result
}

const entity = (char: string) => char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : `&#${char.charCodeAt(0)};`

// The blank right after an entity is swallowed, a no-break space is not
const blank = (match: string) => match.endsWith(' ') ? '&nbsp;' : ''

/**
 * Text that markdown shows as it is. QQ shows a backslash escape with its backslash, while an HTML entity comes out
 * as the bare character, read as no syntax (2026-10-31); a symbol that makes no syntax shows as it is anyway.
 */
export const escapeMarkdown = (text: string) => text
  .replace(/([&<>*_~`[\]#$]) ?/g, (match, char: string) => entity(char) + blank(match))
  // What only means something at the start of a line: list items, rules, setext headings
  .replace(/^([ \t]*)([-+=]) ?/gm, (match, space: string, char: string) => space + entity(char) + blank(match))
  .replace(/^([ \t]*\d+)([.)]) ?/gm, (match, number: string, char: string) => number + entity(char) + blank(match))

// What the platform renders inside text: mentions, and in guilds sub-channel links and emoji
const EMBEDDED_TAG = /(<qqbot-at-user\s+id="[^"]*"\s*\/>|<qqbot-at-everyone\s*\/>|<@!?[^>\s]+>|<#[^>\s]+>|<emoji:\d+>)/

/** Text written for a plain message, as markdown: escaped, except for the tags in it */
export const textToMarkdown = (text: string) =>
  text.split(EMBEDDED_TAG).map((part, i) => i % 2 ? part : escapeMarkdown(part)).join('')

/** The text of a markdown element's children; a `<markdown>` wrapper left in the text is dropped. */
export function extractMarkdownText(children: readonly h[]): string {
  let content = ''
  const paragraph = () => {
    if (content && !content.endsWith('\n')) content += '\n'
  }
  for (const child of children) {
    if (child.type === 'text') {
      let text = typeof child.attrs.content === 'string' ? child.attrs.content : ''
      while (text.startsWith('<markdown>')) text = text.slice(10)
      while (text.endsWith('</markdown>')) text = text.slice(0, -11)
      content += text
    } else if (child.type === 'br') {
      content += '\n'
    } else if (child.type === 'p') {
      paragraph()
      content += extractMarkdownText(child.children)
      paragraph()
    } else {
      content += extractMarkdownText(child.children)
    }
  }
  return content
}

function plainText(children: readonly h[]): string {
  let content = ''
  for (const child of children) {
    if (child.type === 'text') content += typeof child.attrs.content === 'string' ? child.attrs.content : ''
    else if (child.type === 'br') content += '\n'
    else content += plainText(child.children)
  }
  return content
}

/** `<button>` / `<qq:button>`: Satori's text, type and href, or the platform's own render_data and action. */
export function decodeButton(attrs: Attrs, label: string): Button {
  attrs = snakeAttrs(attrs)
  const action = isRecord(attrs.action) ? attrs.action as Attrs : {}
  const renderData = isRecord(attrs.render_data) ? attrs.render_data as Attrs : {}
  const permission = isRecord(attrs.permission) ? attrs.permission
    : isRecord(action.permission) ? action.permission : undefined
  const type = attrs.type ?? action.type
  const link = type === 'link' || type === 0
  // Satori's `action` type is a callback button
  const callback = type === 'action'
  const text = typeof attrs.text === 'string' ? attrs.text : undefined

  let data = attrs.data ?? action.data
  if (data === undefined || data === null || data === '') {
    const id = typeof attrs.id === 'string' ? attrs.id : ''
    data = link ? (attrs.href ?? '') : callback ? (id || text || label) : (text || label || id)
  }
  const display = renderData.label || label || text || data

  const button: Button = {
    ...(typeof attrs.id === 'string' ? { id: attrs.id } : {}),
    ...(typeof attrs.group_id === 'string' ? { group_id: attrs.group_id } : {}),
    render_data: {
      label: String(display || ''),
      visited_label: String(display || ''),
      style: renderData.style ?? (typeof attrs.style === 'number' ? attrs.style : 1),
    },
    action: {
      type: typeof type === 'number' ? type : (link ? 0 : callback ? 1 : 2),
      permission: (permission as Button['action']['permission']) || { type: 2 },
      data: String(data || ''),
      ...(link ? {} : { enter: true }),
    },
  }
  Object.assign(button.action, action)
  Object.assign(button.render_data, renderData)
  if (!button.render_data.label) button.render_data.label = String(button.action.data || '')
  if (!button.render_data.visited_label) button.render_data.visited_label = button.render_data.label
  if (button.render_data.style === undefined) button.render_data.style = 1
  return button
}

function parseMarkdown(value: unknown): Markdown | undefined {
  if (!isRecord(value)) return
  const markdown: Markdown = {}
  if (typeof value.content === 'string') markdown.content = value.content
  if (typeof value.custom_template_id === 'string') markdown.custom_template_id = value.custom_template_id
  if (value.params !== undefined) {
    if (!Array.isArray(value.params)) return
    const params: Markdown['params'] = []
    for (const param of value.params) {
      if (!isRecord(param) || typeof param.key !== 'string' || !isStrings(param.values)) return
      params.push({ key: param.key, values: param.values })
    }
    markdown.params = params
  }
  if (!markdown.content && !markdown.custom_template_id) return
  return markdown
}

function parseButton(value: unknown): Button | undefined {
  if (!isRecord(value) || !isRecord(value.render_data) || !isRecord(value.action)) return
  const { render_data: render, action } = value
  if (typeof render.label !== 'string') return
  if (typeof action.type !== 'number' || typeof action.data !== 'string') return
  if (!isRecord(action.permission) || typeof action.permission.type !== 'number') return
  const permission: Button['action']['permission'] = { type: action.permission.type }
  if (isStrings(action.permission.specify_user_ids)) permission.specify_user_ids = action.permission.specify_user_ids
  if (isStrings(action.permission.specify_role_ids)) permission.specify_role_ids = action.permission.specify_role_ids
  const button: Button = {
    render_data: {
      label: render.label,
      ...(typeof render.visited_label === 'string' ? { visited_label: render.visited_label } : {}),
      ...(typeof render.style === 'number' ? { style: render.style } : {}),
    },
    action: { type: action.type, permission, data: action.data },
  }
  for (const key of ['reply', 'enter', 'at_bot_show_channel_list'] as const) {
    if (typeof action[key] === 'boolean') button.action[key] = action[key] as boolean
  }
  for (const key of ['anchor', 'click_limit'] as const) {
    if (typeof action[key] === 'number') button.action[key] = action[key] as number
  }
  if (typeof action.unsupport_tips === 'string') button.action.unsupport_tips = action.unsupport_tips
  if (isRecord(action.modal)) {
    const modal: NonNullable<Button['action']['modal']> = {}
    for (const key of ['content', 'confirm_text', 'cancel_text'] as const) {
      if (typeof action.modal[key] === 'string') modal[key] = action.modal[key] as string
    }
    if (Object.keys(modal).length) button.action.modal = modal
  }
  if (typeof value.id === 'string') button.id = value.id
  if (typeof value.group_id === 'string') button.group_id = value.group_id
  return button
}

function parseKeyboard(value: unknown): Keyboard | undefined {
  if (!isRecord(value)) return
  const keyboard: Keyboard = {}
  if (typeof value.id === 'string') keyboard.id = value.id
  if (isRecord(value.content) && Array.isArray(value.content.rows)) {
    const rows: { buttons: Button[] }[] = []
    for (const row of value.content.rows) {
      if (!isRecord(row) || !Array.isArray(row.buttons)) return
      const buttons: Button[] = []
      for (const item of row.buttons) {
        const button = parseButton(item)
        if (!button) return
        buttons.push(button)
      }
      rows.push({ buttons })
    }
    keyboard.content = { rows }
  }
  if (!keyboard.id && !keyboard.content) return
  return keyboard
}

function parseStream(value: unknown): Stream | undefined {
  if (!isRecord(value) || typeof value.state !== 'number') return
  const stream: Stream = { state: value.state }
  if (typeof value.id === 'string') stream.id = value.id
  if (typeof value.index === 'number') stream.index = value.index
  if (typeof value.reset === 'boolean') stream.reset = value.reset
  return stream
}

const autoStreamOf = (attrs: Attrs, stream: Stream | undefined): boolean | 'end' | undefined =>
  stream ? undefined : typeof attrs.stream === 'boolean' || attrs.stream === 'end' ? attrs.stream : undefined

function wrapperOf(attrs: Attrs): Attrs | undefined {
  for (const value of [attrs.content, attrs.markdown]) {
    if (isRecord(value) && ('markdown' in value || 'keyboard' in value || 'id' in value || 'templateId' in value)) return value
  }
}

function markdownRequest(markdown: Markdown, keyboard?: Keyboard, stream?: Stream): CustomRequest {
  return {
    msg_type: MessageType.Markdown,
    markdown,
    ...(keyboard ? { keyboard } : {}),
    ...(stream ? { stream } : {}),
  }
}

const contentOf = (attrs: Attrs, children: readonly h[]) =>
  typeof attrs.content === 'string' ? attrs.content : extractMarkdownText(children) || ' '

/** `<qq:json>`: a keyboard template (or full keyboard) on its own */
function parseJson(attrs: Attrs, children: readonly h[]): CustomPayload | undefined {
  const stream = parseStream(attrs.stream)
  const wrapper = wrapperOf(attrs)
  const source = wrapper?.keyboard ?? attrs.keyboard
  const templateId = [attrs.id, attrs.templateId, wrapper?.id, wrapper?.templateId, source, attrs.content]
    .find((value): value is string => typeof value === 'string') ?? extractMarkdownText(children).trim()
  const keyboard = parseKeyboard(source) || (templateId ? { id: templateId } : undefined)
  if (!keyboard?.id) return
  return {
    request: { msg_type: MessageType.Markdown, content: '', keyboard, ...(stream ? { stream } : {}) },
    autoStream: autoStreamOf(attrs, stream),
  }
}

/** `<qq:markdown>`: a markdown template with its params, or plain content */
function parseTemplateMarkdown(attrs: Attrs, children: readonly h[]): CustomPayload | undefined {
  const stream = parseStream(attrs.stream)
  const autoStream = autoStreamOf(attrs, stream)
  const wrapper = wrapperOf(attrs)
  const keyboard = parseKeyboard(attrs.keyboard ?? wrapper?.keyboard)
  const direct = parseMarkdown(attrs)
  if (direct?.custom_template_id) return { request: markdownRequest(direct, keyboard, stream), autoStream }
  const source = wrapper?.markdown ?? attrs.markdown
  if (!source) return { request: markdownRequest({ content: contentOf(attrs, children) }, undefined, stream), autoStream }
  const markdown = parseMarkdown(source)
  if (!markdown?.custom_template_id) return
  return { request: markdownRequest(markdown, keyboard, stream), autoStream }
}

/** `<qq:rawmarkdown>`: native markdown, optionally with a keyboard */
function parseRawMarkdown(attrs: Attrs, children: readonly h[]): CustomPayload | undefined {
  const stream = parseStream(attrs.stream)
  const autoStream = autoStreamOf(attrs, stream)
  const wrapper = wrapperOf(attrs)
  const keyboard = parseKeyboard(attrs.keyboard ?? wrapper?.keyboard)
  const direct = parseMarkdown(attrs)
  if (direct?.content) return { request: markdownRequest(direct, keyboard, stream), autoStream }
  const source = wrapper?.markdown ?? attrs.markdown
  if (!source) return { request: markdownRequest({ content: contentOf(attrs, children) }, keyboard, stream), autoStream }
  const markdown = parseMarkdown(source)
  if (!markdown?.content) return
  return { request: markdownRequest(markdown, keyboard, stream), autoStream }
}

export function parseCustomElement(element: h): CustomPayload | undefined {
  const { type, children } = element
  const attrs = snakeAttrs(element.attrs)
  switch (type) {
    case 'qq:rawmarkdown-without-keyboard': {
      const stream = parseStream(attrs.stream)
      return { request: markdownRequest({ content: contentOf(attrs, children) }, undefined, stream), autoStream: autoStreamOf(attrs, stream) }
    }
    case 'qq:json':
      return parseJson(attrs, children)
    case 'qq:markdown':
      return parseTemplateMarkdown(attrs, children)
    case 'qq:rawmarkdown':
      return parseRawMarkdown(attrs, children)
  }
}

function arkRequest(ark: Ark): CustomRequest {
  return { msg_type: MessageType.Ark, content: ' ', ark }
}

/**
 * `<card>` (packages/plugin-sdk CardAttrs): with a picture the text and image template (24), its subtitle the
 * link's host; without one a list (23) of the description linked. Undefined without a title and a link.
 */
export function parseCardElement(element: h): CustomRequest | undefined {
  if (element.type !== 'card') return
  const attrs = element.attrs
  const title = field(attrs, 'title')
  const url = field(attrs, 'url')
  if (!title || !url) return
  const desc = field(attrs, 'desc') || title
  const prompt = field(attrs, 'prompt') || title
  const image = field(attrs, 'image')
  if (!image) {
    return arkRequest({
      template_id: 23,
      kv: [
        { key: '#DESC#', value: title },
        { key: '#PROMPT#', value: prompt },
        { key: '#LIST#', obj: [{ obj_kv: [{ key: 'desc', value: desc }, { key: 'link', value: url }] }] },
      ],
    })
  }
  let host = title
  try {
    host = new URL(url).host || title
  } catch {}
  return arkRequest({
    template_id: 24,
    kv: [
      { key: '#DESC#', value: desc },
      { key: '#PROMPT#', value: prompt },
      { key: '#TITLE#', value: title },
      { key: '#METADESC#', value: desc },
      { key: '#IMG#', value: image },
      { key: '#LINK#', value: url },
      { key: '#SUBTITLE#', value: host },
    ],
  })
}

export const isWebUrl = (src: string) => /^https?:\/\//i.test(src)

// Parentheses and blanks would end the link early
const markdownUrl = (url: string) => url.replace(/[()\s]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))

/**
 * `<card>` as markdown, which takes no application, unlike ark templates: the title in bold, linked when there is a
 * link, the description, then an image on the web, which QQ markdown sizes as `#<width>px #<height>px`.
 */
export function cardMarkdown(attrs: Attrs, size?: { width: number; height: number }): string {
  const title = field(attrs, 'title')
  const url = field(attrs, 'url')
  const desc = field(attrs, 'desc')
  const image = field(attrs, 'image')
  const link = (text: string) => url ? `[${escapeMarkdown(text)}](${markdownUrl(url)})` : escapeMarkdown(text)
  const lines: string[] = []
  if (title) lines.push(`**${link(title)}**`)
  else if (url) lines.push(link(url))
  if (desc) lines.push(escapeMarkdown(desc))
  if (image && isWebUrl(image)) {
    lines.push(`![${escapeMarkdown(title || 'img')}${size ? ` #${size.width}px #${size.height}px` : ''}](${markdownUrl(image)})`)
  }
  return lines.join('\n')
}

function field(source: Attrs, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof source[key] === 'string') return source[key]
  }
}

function parseArk(value: unknown): Ark | undefined {
  if (!isRecord(value) || typeof value.template_id !== 'number' || !Array.isArray(value.kv)) return
  const kv: Ark['kv'] = []
  for (const item of value.kv) {
    if (!isRecord(item) || typeof item.key !== 'string') return
    if (typeof item.value === 'string') {
      kv.push({ key: item.key, value: item.value })
      continue
    }
    if (!Array.isArray(item.obj)) return
    const obj: NonNullable<Ark['kv'][number]['obj']> = []
    for (const entry of item.obj) {
      if (!isRecord(entry) || !Array.isArray(entry.obj_kv)) return
      const pairs: { key: string; value: string }[] = []
      for (const pair of entry.obj_kv) {
        if (!isRecord(pair) || typeof pair.key !== 'string' || typeof pair.value !== 'string') return
        pairs.push({ key: pair.key, value: pair.value })
      }
      obj.push({ obj_kv: pairs })
    }
    kv.push({ key: item.key, obj })
  }
  return { template_id: value.template_id, kv }
}

/** `<qq:ark>` with a full ark, or the templates 23 (list), 24 (text and image) and 37 (big image). */
export function parseArkElement(element: h): CustomRequest | undefined {
  const { type, children } = element
  const attrs = snakeAttrs(element.attrs)
  const source: Attrs = isRecord(attrs.content) ? attrs.content : attrs
  if (type === 'qq:ark24') {
    const values = {
      desc: field(source, 'desc'),
      prompt: field(source, 'prompt'),
      title: field(source, 'title'),
      metaDesc: field(source, 'metaDesc', 'metadesc'),
      img: field(source, 'img'),
      link: field(source, 'link'),
      subTitle: field(source, 'subTitle', 'subtitle'),
    }
    if (Object.values(values).some(value => !value)) return
    return arkRequest({
      template_id: 24,
      kv: [
        { key: '#DESC#', value: values.desc },
        { key: '#PROMPT#', value: values.prompt },
        { key: '#TITLE#', value: values.title },
        { key: '#METADESC#', value: values.metaDesc },
        { key: '#IMG#', value: values.img },
        { key: '#LINK#', value: values.link },
        { key: '#SUBTITLE#', value: values.subTitle },
      ],
    })
  }
  if (type === 'qq:ark37') {
    const prompt = field(source, 'prompt')
    const title = field(source, 'metaTitle', 'metatitle', 'title')
    const subTitle = field(source, 'metaSubTitle', 'metasubtitle', 'subtitle')
    const cover = field(source, 'metaCover', 'metacover', 'cover')
    const url = field(source, 'metaUrl', 'metaurl', 'url') ?? plainText(children).trim()
    if (!prompt || !title || !subTitle || !cover || !url) return
    return arkRequest({
      template_id: 37,
      kv: [
        { key: '#PROMPT#', value: prompt },
        { key: '#METATITLE#', value: title },
        { key: '#METASUBTITLE#', value: subTitle },
        { key: '#METACOVER#', value: cover },
        { key: '#METAURL#', value: url },
      ],
    })
  }
  if (type === 'qq:ark23') {
    const desc = field(source, 'desc')
    const prompt = field(source, 'prompt')
    if (!desc || !prompt || !Array.isArray(source.list)) return
    const list: { obj_kv: { key: string; value: string }[] }[] = []
    for (const item of source.list) {
      if (!isRecord(item) || typeof item.desc !== 'string' || !item.desc) return
      list.push({
        obj_kv: [
          { key: 'desc', value: item.desc },
          ...(typeof item.link === 'string' && item.link ? [{ key: 'link', value: item.link }] : []),
        ],
      })
    }
    return arkRequest({
      template_id: 23,
      kv: [{ key: '#DESC#', value: desc }, { key: '#PROMPT#', value: prompt }, { key: '#LIST#', obj: list }],
    })
  }
  if (type === 'qq:ark') {
    const ark = parseArk(isRecord(attrs.content) ? attrs.content : attrs.ark)
    return ark && arkRequest(ark)
  }
}

const MARKDOWN_DATA_IMAGE = /!\[[^\]\n]*\]\((data:image\/[\w.+-]+;base64,[^)\s]+)\)/g

export type MarkdownPart = { type: 'text'; content: string } | { type: 'image'; src: string }

/** Markdown with inline `data:` images split around them: those go out as media of their own. */
export function splitDataImages(content: string): MarkdownPart[] | undefined {
  const parts: MarkdownPart[] = []
  let last = 0
  for (const match of content.matchAll(MARKDOWN_DATA_IMAGE)) {
    if (match.index > last) parts.push({ type: 'text', content: content.slice(last, match.index) })
    parts.push({ type: 'image', src: match[1] })
    last = match.index + match[0].length
  }
  if (!parts.length) return
  if (last < content.length) parts.push({ type: 'text', content: content.slice(last) })
  return parts
}
