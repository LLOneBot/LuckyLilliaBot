import React from 'react'

/**
 * Markdown from plugins (their `llbot.details`), as React elements: raw HTML stays text, links go to http(s) or
 * mailto only. The common subset: headings (ATX and setext), paragraphs, lists (nested by indent), quotes, fenced
 * code, rules, pipe tables; inline code, links, images, autolinks, bold, italic, strikethrough. A line break in a
 * paragraph is kept, the way people write Chinese line by line.
 */

type Align = 'left' | 'center' | 'right' | undefined

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; text: string }
  | { type: 'quote'; children: Block[] }
  | { type: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { type: 'rule' }
  | { type: 'table'; head: string[]; align: Align[]; rows: string[][] }

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const QUOTE = /^ {0,3}>/
const ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/
const DELIMITER_ROW = /^ *\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/

const indentOf = (line: string) => line.length - line.trimStart().length
const startsBlock = (line: string) => FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line)

function cells(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'))
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const indent = indentOf(line)
      const body: string[] = []
      for (i++; i < lines.length && !lines[i].trimStart().startsWith(fence[1]); i++) {
        body.push(lines[i].slice(Math.min(indent, indentOf(lines[i]))))
      }
      i++
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] ?? '' })
      i++
      continue
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && lines[i].trim() && (QUOTE.test(lines[i]) || !startsBlock(lines[i]))) {
        body.push(lines[i++].replace(/^ {0,3}> ?/, ''))
      }
      blocks.push({ type: 'quote', children: parseBlocks(body) })
      continue
    }

    const first = ITEM.exec(line)
    if (first) {
      const indent = first[1].length
      const ordered = /\d/.test(first[2])
      const items: Block[][] = []
      while (i < lines.length) {
        // Blank lines between two items keep the list going
        let next = i
        while (next < lines.length && !lines[next].trim()) next++
        const item = ITEM.exec(lines[next] ?? '')
        if (!item || item[1].length !== indent || /\d/.test(item[2]) !== ordered) break
        i = next
        const offset = item[1].length + item[2].length + 1
        const content = [item[3] ?? '']
        for (i++; i < lines.length; i++) {
          const text = lines[i]
          if (!text.trim()) {
            // A blank line inside an item: more of it follows, indented under it
            const after = lines.slice(i + 1).find(rest => rest.trim())
            if (after !== undefined && indentOf(after) > indent) {
              content.push('')
              continue
            }
            break
          }
          if (indentOf(text) > indent) content.push(text.slice(Math.min(indentOf(text), offset)))
          else if (!startsBlock(text) && content[content.length - 1] !== '') content.push(text.trim())
          else break
        }
        items.push(parseBlocks(content))
      }
      blocks.push({ type: 'list', ordered, start: ordered ? parseInt(first[2], 10) : 1, items })
      continue
    }

    if (line.includes('|') && DELIMITER_ROW.test(lines[i + 1] ?? '') && lines[i + 1].includes('-')) {
      const head = cells(line)
      const align = cells(lines[i + 1]).map((cell): Align => {
        if (cell.startsWith(':') && cell.endsWith(':')) return 'center'
        if (cell.endsWith(':')) return 'right'
        return cell.startsWith(':') ? 'left' : undefined
      })
      const rows: string[][] = []
      for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes('|'); i++) rows.push(cells(lines[i]))
      blocks.push({ type: 'table', head, align, rows })
      continue
    }

    const body: string[] = []
    let level = 0
    while (i < lines.length && lines[i].trim()) {
      if (body.length) {
        const setext = SETEXT.exec(lines[i])
        if (setext) {
          level = setext[1][0] === '=' ? 1 : 2
          i++
          break
        }
        if (startsBlock(lines[i])) break
      }
      // A trailing backslash is a hard break, which every line end is here
      body.push(lines[i++].trim().replace(/\\$/, ''))
    }
    blocks.push(level ? { type: 'heading', level, text: body.join(' ') } : { type: 'paragraph', text: body.join('\n') })
  }
  return blocks
}

interface Context {
  base?: string
  onImage?(src: string, alt: string): void
}

/** http(s) as it is; a relative path inside the plugin's package, against `base`; anything else is not loaded */
function imageUrl(src: string, base?: string): string | undefined {
  if (/^https?:\/\//i.test(src)) return src
  if (/^[a-z][\w+.-]*:/i.test(src) || src.startsWith('/') || base === undefined) return
  return base + src.replace(/^\.\//, '')
}

const LINK = 'text-pink-500 hover:underline [overflow-wrap:anywhere]'

// A link's or image's address: parentheses in it come in pairs, as in wiki/Foo_(bar)
const DESTINATION = String.raw`(?:[^\s<>()]|\([^\s<>()]*\))+`

function link(href: string, children: React.ReactNode, key: number): React.ReactNode {
  if (!/^(https?:|mailto:)/i.test(href)) return <React.Fragment key={key}>{children}</React.Fragment>
  return <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={LINK}>{children}</a>
}

interface Rule {
  re: RegExp
  render(match: RegExpExecArray, key: number, context: Context): React.ReactNode
  /** `_` emphasis does not start or end inside a word (snake_case) */
  wordBound?: boolean
}

const RULES: Rule[] = [
  { re: /\\([!-/:-@[-`{-~])/y, render: match => match[1] },
  {
    re: /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/y,
    render: (match, key) => (
      <code key={key} className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-[0.85em] text-theme">
        {match[2].replace(/^ ([\s\S]*) $/, '$1')}
      </code>
    ),
  },
  {
    re: new RegExp(String.raw`!\[([^\]]*)\]\(\s*<?(${DESTINATION})>?(?:\s+"[^"]*")?\s*\)`, 'y'),
    render: (match, key, context) => {
      const [, alt, src] = match
      const url = imageUrl(src, context.base)
      if (!url) return <span key={key} className="text-theme-hint">[{alt || '图片'}]</span>
      const open = context.onImage
      return (
        <img
          key={key}
          src={url}
          alt={alt}
          loading="lazy"
          onClick={open && (() => open(url, alt))}
          className={`inline-block max-w-full rounded-lg align-middle ${open ? 'cursor-zoom-in' : ''}`}
        />
      )
    },
  },
  {
    re: new RegExp(String.raw`\[((?:\\.|\[[^\]]*\]|[^\]\\])*)\]\(\s*<?(${DESTINATION})>?(?:\s+"[^"]*")?\s*\)`, 'y'),
    render: (match, key, context) => link(match[2], inline(match[1], context), key),
  },
  { re: /<((?:https?:\/\/|mailto:)[^\s<>]+)>/y, render: (match, key) => link(match[1], match[1], key) },
  // ASCII only, so a URL running into Chinese text stops where the text starts; it does not end in punctuation
  {
    re: /https?:\/\/[A-Za-z0-9\-._~:/?#@!$&'*+,;=%]*[A-Za-z0-9\-_~/#@$&*+=%]/y,
    render: (match, key) => link(match[0], match[0], key),
  },
  {
    re: /(\*\*|__)(?=\S)([\s\S]*?\S)\1/y,
    render: (match, key, context) => <strong key={key} className="font-semibold text-theme">{inline(match[2], context)}</strong>,
    wordBound: true,
  },
  {
    re: /(\*|_)(?=\S)([\s\S]*?\S)\1/y,
    render: (match, key, context) => <em key={key}>{inline(match[2], context)}</em>,
    wordBound: true,
  },
  { re: /~~(?=\S)([\s\S]*?\S)~~/y, render: (match, key, context) => <del key={key}>{inline(match[1], context)}</del> },
  { re: /\n/y, render: (_, key) => <br key={key} /> },
]

function inline(text: string, context: Context): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let plain = ''
  let at = 0
  scan: while (at < text.length) {
    for (const rule of RULES) {
      rule.re.lastIndex = at
      const match = rule.re.exec(text)
      if (!match) continue
      const end = at + match[0].length
      if (rule.wordBound && match[1]?.[0] === '_' && (/\w/.test(text[at - 1] ?? '') || /\w/.test(text[end] ?? ''))) continue
      if (plain) nodes.push(plain)
      plain = ''
      nodes.push(rule.render(match, nodes.length, context))
      at = end
      continue scan
    }
    plain += text[at++]
  }
  if (plain) nodes.push(plain)
  return nodes
}

const HEADING_SIZE = ['', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-sm', 'text-sm']

function renderBlocks(blocks: Block[], context: Context): React.ReactNode[] {
  return blocks.map((block, key) => {
    switch (block.type) {
      case 'heading': {
        const Tag = `h${block.level}` as 'h1'
        return <Tag key={key} className={`${HEADING_SIZE[block.level]} font-semibold text-theme mt-6 mb-2 first:mt-0`}>{inline(block.text, context)}</Tag>
      }
      case 'paragraph':
        return <p key={key} className="my-3 first:mt-0 last:mb-0">{inline(block.text, context)}</p>
      case 'code':
        return (
          <pre key={key} className="my-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 overflow-x-auto text-xs leading-relaxed text-theme">
            <code className="font-mono">{block.text}</code>
          </pre>
        )
      case 'quote':
        return (
          <blockquote key={key} className="my-3 pl-3 border-l-4 border-pink-300 dark:border-pink-700 text-theme-muted">
            {renderBlocks(block.children, context)}
          </blockquote>
        )
      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul'
        return (
          <Tag
            key={key}
            start={block.ordered && block.start !== 1 ? block.start : undefined}
            className={`my-3 pl-5 space-y-1 ${block.ordered ? 'list-decimal' : 'list-disc'} [&_ol]:my-1 [&_ul]:my-1`}
          >
            {block.items.map((item, index) => <li key={index} className="[&>p]:my-0">{renderBlocks(item, context)}</li>)}
          </Tag>
        )
      }
      case 'rule':
        return <hr key={key} className="my-5 border-0 border-t border-theme-divider" />
      case 'table':
        return (
          <div key={key} className="my-3 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {block.head.map((cell, index) => (
                    <th key={index} style={{ textAlign: block.align[index] }} className="px-3 py-1.5 border border-theme-divider font-semibold text-theme text-left whitespace-nowrap">
                      {inline(cell, context)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, index) => (
                  <tr key={index}>
                    {block.head.map((_, column) => (
                      <td key={column} style={{ textAlign: block.align[column] }} className="px-3 py-1.5 border border-theme-divider align-top">
                        {inline(row[column] ?? '', context)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
    }
  })
}

interface MarkdownOptions {
  /** The surrounding dialog already displays the title; omit only a leading level-one document heading. */
  omitTitle?: boolean
  /** What relative image paths resolve against, ending in a slash; without it they are not loaded */
  base?: string
  /** Makes images open larger when clicked */
  onImage?(src: string, alt: string): void
  className?: string
}

export function renderMarkdown(source: string, { base, onImage, className = '', omitTitle = false }: MarkdownOptions = {}): React.ReactElement {
  const blocks = parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'))
  if (omitTitle && blocks[0]?.type === 'heading' && blocks[0].level === 1) blocks.shift()
  return <div className={`text-sm leading-relaxed text-theme-secondary break-words ${className}`}>{renderBlocks(blocks, { base, onImage })}</div>
}

export const Markdown: React.FC<MarkdownOptions & { source: string }> = ({ source, ...options }) => renderMarkdown(source, options)
