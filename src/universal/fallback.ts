import h from '@satorijs/element'
import type { Context } from 'cordis'
import type { Bot, Feature } from '@luckylillia/plugin-sdk'

// The elements beyond Satori's that a plugin may send to any bot (packages/plugin-sdk Feature): a bot that does not
// declare one gets its fallback, made of standard elements only

const FEATURES: Record<string, Feature> = {
  markdown: 'message.markdown',
  button: 'message.button',
  'button-group': 'message.button',
  card: 'message.card',
  face: 'message.face',
}

type Attrs = Record<string, any>

const isRecord = (value: unknown): value is Attrs => typeof value === 'object' && value !== null
const str = (value: unknown) => typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)

/** Run by ctx.bots.beforeSend once bot/before-send is through. */
export async function applyFallbacks(ctx: Context, bot: Bot, channelId: string, content: h[]): Promise<h[]> {
  const features = new Set<string>(bot.features ?? [])
  const visit = async (elements: h[]): Promise<h[]> => {
    const out: h[] = []
    for (const element of features.has('message.button') ? elements : groupButtons(elements)) {
      const feature = FEATURES[element.type]
      if (!feature || features.has(feature)) {
        out.push(element.children.length ? h(element.type, element.attrs, await visit(element.children)) : element)
        continue
      }
      const custom = await ctx.serial('bot/fallback', bot, channelId, element)
      out.push(...(custom === undefined ? await visit(fallback(element)) : h.normalize(custom as h.Fragment)))
    }
    return out
  }
  return await visit(content)
}

/** Loose buttons next to each other make a row, as a `<button-group>` does: the fallback gets the row whole. */
function groupButtons(elements: h[]): h[] {
  const out: h[] = []
  let row: h[] = []
  let blanks: h[] = []
  const close = () => {
    if (row.length) out.push(h('button-group', {}, row))
    out.push(...blanks)
    row = []
    blanks = []
  }
  for (const element of elements) {
    if (element.type === 'button') {
      row.push(element)
      blanks = []
    } else if (row.length && element.type === 'text' && !str(element.attrs.content).trim()) {
      blanks.push(element)
    } else {
      close()
      out.push(element)
    }
  }
  close()
  return out
}

/** The built-in fallback of an extension element; also for an adapter that cannot send one it declares. */
export function fallback(element: h): h[] {
  const { type, attrs, children } = element
  if (type === 'markdown') return markdownToElements(typeof attrs.content === 'string' ? attrs.content : sourceOf(children))
  if (type === 'button' || type === 'button-group') {
    const items = (type === 'button' ? [element] : children).map(buttonFallback).filter((item): item is h => !!item)
    if (!items.length) return []
    return [h('p', {}, items.flatMap((item, index) => index ? [h.text('  '), item] : [item]))]
  }
  if (type === 'card') return cardFallback(attrs)
  if (type === 'face') return [h.text(`[${str(attrs.name) || '表情'}]`)]
  return children
}

/** The markdown source in an element's children: text as it is, `<br>` and `<p>` as line breaks. */
function sourceOf(children: readonly h[]): string {
  let source = ''
  for (const child of children) {
    if (child.type === 'text') source += str(child.attrs.content)
    else if (child.type === 'br') source += '\n'
    else if (child.type === 'p') source += (source && !source.endsWith('\n') ? '\n' : '') + sourceOf(child.children) + '\n'
    else source += sourceOf(child.children)
  }
  return source
}

function textOf(children: readonly h[]): string {
  return children.map(child => child.type === 'text' ? str(child.attrs.content) : textOf(child.children)).join('')
}

/** Read the way the QQ official bot reads a button (qq-official/elements.ts decodeButton). */
function buttonFallback(button: h): h | undefined {
  if (button.type !== 'button') return
  const attrs = button.attrs
  const action: Attrs = isRecord(attrs.action) ? attrs.action : {}
  const render: Attrs = isRecord(attrs.renderData) ? attrs.renderData : isRecord(attrs.render_data) ? attrs.render_data : {}
  const type = attrs.type ?? action.type
  const label = textOf(button.children).trim() || str(render.label) || str(attrs.text)
  if (type === 'link' || type === 0) {
    const href = str(attrs.href ?? action.data)
    if (!href) return
    return label && label !== href ? h('a', { href }, label) : h.text(href)
  }
  // A callback only means something to the platform that shows the button
  if (type === 'action' || type === 1) return
  const data = str(attrs.data ?? action.data) || str(attrs.text) || label || str(attrs.id)
  if (!data) return
  return h.text(label && label !== data ? `${label}（发送「${data}」）` : `「${data}」`)
}

function cardFallback(attrs: Attrs): h[] {
  const title = str(attrs.title)
  const url = str(attrs.url)
  const desc = str(attrs.desc)
  const image = str(attrs.image)
  const out: h[] = []
  if (title) out.push(h('p', {}, url && url !== title ? h('a', { href: url }, title) : title))
  else if (url) out.push(h('p', {}, url))
  if (desc) out.push(h('p', {}, desc))
  if (image) out.push(h.image(image))
  return out
}

// Escape, image, link, autolink, code, bold (** and __), strikethrough, italic (* and _, not inside a word)
const INLINE = /\\([\\`*_{}[\]()#+\-.!~|<>])|!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)|\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)|<(https?:\/\/[^>\s]+)>|`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*(?!\s)(.+?)\*|(?<![\w\\])_(?!\s)(.+?)_(?!\w)/g

function inline(text: string): h[] {
  const out: h[] = []
  const append = (content: string) => {
    const last = out[out.length - 1]
    if (last?.type === 'text') out[out.length - 1] = h.text(str(last.attrs.content) + content)
    else out.push(h.text(content))
  }
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) append(text.slice(last, match.index))
    last = match.index + match[0].length
    const [, escaped, , image, label, href, autolink, code, bold, boldAlt, strike, italic, italicAlt] = match
    if (escaped !== undefined) append(escaped)
    else if (image !== undefined) out.push(h.image(image))
    else if (href !== undefined) {
      if (label === href) append(href)
      else out.push(h('a', { href }, inline(label)))
    } else if (autolink !== undefined) append(autolink)
    else if (code !== undefined) out.push(h('code', {}, code))
    else if ((bold ?? boldAlt) !== undefined) out.push(h('b', {}, inline(bold ?? boldAlt)))
    else if (strike !== undefined) out.push(h('s', {}, inline(strike)))
    else out.push(h('i', {}, inline(italic ?? italicAlt)))
  }
  if (last < text.length) append(text.slice(last))
  return out
}

/**
 * Markdown as formatted text: emphasis, links, code and images as elements, every block a paragraph, list items and
 * quotes marked with text. What a platform cannot show of those (bold, say) it shows as plain text.
 */
export function markdownToElements(source: string): h[] {
  const blocks: h[] = []
  let paragraph: h[] = []
  const endParagraph = () => {
    if (paragraph.length) blocks.push(h('p', {}, paragraph))
    paragraph = []
  }
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = /^\s*(```|~~~)/.exec(line)
    if (fence) {
      endParagraph()
      const code: string[] = []
      while (++i < lines.length && !lines[i].trimStart().startsWith(fence[1])) code.push(lines[i])
      if (code.length) blocks.push(h('p', {}, h('code', {}, code.join('\n'))))
      continue
    }
    if (!line.trim()) {
      endParagraph()
      continue
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/.exec(line)
    const rule = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
    const quote = /^\s{0,3}>\s?(.*)$/.exec(line)
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (heading || rule || quote || item) endParagraph()
    if (heading) blocks.push(h('p', {}, h('b', {}, inline(heading[1]))))
    else if (rule) blocks.push(h('p', {}, '——————'))
    else if (quote) blocks.push(h('p', {}, [h.text('｜'), ...inline(quote[1])]))
    else if (item) {
      const marker = /\d/.test(item[2]) ? item[2] : '•'
      blocks.push(h('p', {}, [h.text(`${'  '.repeat(Math.floor(item[1].length / 2))}${marker} `), ...inline(item[3])]))
    } else {
      if (paragraph.length) paragraph.push(h('br'))
      paragraph.push(...inline(line.trim()))
    }
  }
  endParagraph()
  return blocks
}
