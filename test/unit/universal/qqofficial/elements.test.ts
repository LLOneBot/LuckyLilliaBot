import h from '@satorijs/element'
import { describe, expect, it } from 'vitest'
import {
  decodeButton, escapeMarkdown, extractMarkdownText, parseArkElement, parseCustomElement, splitDataImages,
} from '@/universal/qqofficial/elements'

describe('platform elements', () => {
  it('escapes what markdown would read as syntax', () => {
    expect(escapeMarkdown('a_b *c* [d](e) #f -g >h !i ~j `k` \\')).toBe('a\\_b \\*c\\* \\[d\\]\\(e) \\#f \\-g \\>h \\!i \\~j \\`k\\` \\\\')
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
