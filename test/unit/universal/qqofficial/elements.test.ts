import h from '@satorijs/element'
import { describe, expect, it } from 'vitest'
import {
  decodeButton, escapeMarkdown, extractMarkdownText, parseArkElement, parseCardElement, parseCustomElement, splitDataImages,
  textToMarkdown,
} from '@/plugin/internal/protocol/qq-official/elements'

describe('platform elements', () => {
  it('writes what markdown would read as syntax as HTML entities, which QQ shows as the bare characters', () => {
    // A blank right after an entity would be swallowed: it becomes a no-break space
    expect(escapeMarkdown('a_b *c* [d](e) #f a-b >h !i ~j `k` $l$ <m> & \\'))
      .toBe('a&#95;b &#42;c&#42;&nbsp;&#91;d&#93;(e) &#35;f a-b &gt;h !i &#126;j &#96;k&#96;&nbsp;&#36;l&#36;&nbsp;&lt;m&gt;&nbsp;&amp;&nbsp;\\')
    // At the start of a line only: list items, rules, setext headings
    expect(escapeMarkdown('- a\n  + b\n===\n1. c\n2) d\nx-y 3.5'))
      .toBe('&#45;&nbsp;a\n  &#43;&nbsp;b\n&#61;==\n1&#46;&nbsp;c\n2&#41;&nbsp;d\nx-y 3.5')
  })

  it('turns plain text into markdown, leaving the tags the platform renders as they are', () => {
    expect(textToMarkdown('a_b <qqbot-at-user id="U-1" /> <qqbot-at-everyone /> <@!U2> <#C-1> <emoji:13> [x]'))
      .toBe('a&#95;b <qqbot-at-user id="U-1" /> <qqbot-at-everyone /> <@!U2> <#C-1> <emoji:13> &#91;x&#93;')
  })

  it('reads markdown children as text, paragraphs on their own lines', () => {
    expect(extractMarkdownText(h.parse('<p># t</p>line<br/>next'))).toBe('# t\nline\nnext')
  })

  it('reads button fields however h() spells them', () => {
    expect(decodeButton({ renderData: { label: 'L', style: 0 }, groupId: 'g', action: { type: 1, data: 'd' } }, '')).toEqual({
      group_id: 'g',
      render_data: { label: 'L', visited_label: 'L', style: 0 },
      action: { type: 1, permission: { type: 2 }, data: 'd', enter: true },
    })
    expect(decodeButton({ type: 'input', text: '输入' }, '')).toMatchObject({ action: { type: 2, data: '输入', enter: true } })
  })

  it('makes a Satori action button a callback that reports its id', () => {
    expect(decodeButton({ type: 'action', id: 'vote' }, '投票')).toEqual({
      id: 'vote',
      render_data: { label: '投票', visited_label: '投票', style: 1 },
      action: { type: 1, permission: { type: 2 }, data: 'vote', enter: true },
    })
  })

  it('makes a card the text and image template with a picture, a list of one without', () => {
    expect(parseCardElement(h('card', { title: 'T', url: 'https://e.com/x', desc: 'D', image: 'https://e.com/i.png', prompt: 'P' }))).toEqual({
      msg_type: 3,
      content: ' ',
      ark: {
        template_id: 24,
        kv: [
          { key: '#DESC#', value: 'D' },
          { key: '#PROMPT#', value: 'P' },
          { key: '#TITLE#', value: 'T' },
          { key: '#METADESC#', value: 'D' },
          { key: '#IMG#', value: 'https://e.com/i.png' },
          { key: '#LINK#', value: 'https://e.com/x' },
          { key: '#SUBTITLE#', value: 'e.com' },
        ],
      },
    })
    expect(parseCardElement(h('card', { title: 'T', url: 'https://e.com/x' }))?.ark).toEqual({
      template_id: 23,
      kv: [
        { key: '#DESC#', value: 'T' },
        { key: '#PROMPT#', value: 'T' },
        { key: '#LIST#', obj: [{ obj_kv: [{ key: 'desc', value: 'T' }, { key: 'link', value: 'https://e.com/x' }] }] },
      ],
    })
    expect(parseCardElement(h('card', { title: 'T' }))).toBeUndefined()
  })

  it('builds the list (23) and big image (37) ark templates, and takes a whole ark as it is', () => {
    expect(parseArkElement(h('qq:ark23', { desc: 'D', prompt: 'P', list: [{ desc: 'a', link: 'https://a' }, { desc: 'b' }] }))).toEqual({
      msg_type: 3,
      content: ' ',
      ark: {
        template_id: 23,
        kv: [
          { key: '#DESC#', value: 'D' },
          { key: '#PROMPT#', value: 'P' },
          { key: '#LIST#', obj: [{ obj_kv: [{ key: 'desc', value: 'a' }, { key: 'link', value: 'https://a' }] }, { obj_kv: [{ key: 'desc', value: 'b' }] }] },
        ],
      },
    })
    expect(parseArkElement(h('qq:ark37', { prompt: 'P', title: 'T', subtitle: 'S', cover: 'https://c' }, 'https://u'))?.ark?.kv).toEqual([
      { key: '#PROMPT#', value: 'P' },
      { key: '#METATITLE#', value: 'T' },
      { key: '#METASUBTITLE#', value: 'S' },
      { key: '#METACOVER#', value: 'https://c' },
      { key: '#METAURL#', value: 'https://u' },
    ])
    const ark = { template_id: 99, kv: [{ key: 'k', value: 'v' }] }
    expect(parseArkElement(h('qq:ark', { ark }))?.ark).toEqual(ark)
    // Missing fields: not an ark
    expect(parseArkElement(h('qq:ark24', { desc: 'only' }))).toBeUndefined()
  })

  it('reads markdown templates and keyboards from a wrapper, and streams on request', () => {
    const keyboard = { content: { rows: [{ buttons: [{ render_data: { label: 'x' }, action: { type: 2, permission: { type: 2 }, data: '/x' } }] }] } }
    expect(parseCustomElement(h('qq:markdown', { content: { markdown: { custom_template_id: 'T', params: [] }, keyboard } }))).toEqual({
      request: { msg_type: 2, markdown: { custom_template_id: 'T', params: [] }, keyboard },
      autoStream: undefined,
    })
    expect(parseCustomElement(h('qq:rawmarkdown-without-keyboard', { stream: true }, 'hi'))).toEqual({
      request: { msg_type: 2, markdown: { content: 'hi' } },
      autoStream: true,
    })
    expect(parseCustomElement(h('qq:rawmarkdown', { content: 'x', stream: { state: 10, id: 's' } }))?.request.stream).toEqual({ state: 10, id: 's' })
  })

  it('finds inline data images in markdown', () => {
    expect(splitDataImages('no images')).toBeUndefined()
    expect(splitDataImages('a![](data:image/png;base64,QQ==)b')).toEqual([
      { type: 'text', content: 'a' },
      { type: 'image', src: 'data:image/png;base64,QQ==' },
      { type: 'text', content: 'b' },
    ])
  })
})
