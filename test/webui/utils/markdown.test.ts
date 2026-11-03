import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '@/plugin/internal/service/webui/FE/components/common/Markdown'

const BASE = '/plugin-assets/demo/1.0.0/docs/'

// Without the classes, which only style it: what is left is the structure
const html = (source: string) => renderToStaticMarkup(renderMarkdown(source, { base: BASE })).replace(/ class="[^"]*"/g, '')
const body = (source: string) => html(source).replace(/^<div>|<\/div>$/g, '')

describe('renderMarkdown', () => {
  it('keeps raw HTML as text', () => {
    expect(body('<script>alert(1)</script> <img src=x onerror=alert(1)>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt;</p>',
    )
  })

  it('links only to http(s) and mailto, in a new tab', () => {
    expect(body('[文档](https://example.com/docs) [信](mailto:a@b.c)')).toBe(
      '<p><a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">文档</a> '
      + '<a href="mailto:a@b.c" target="_blank" rel="noopener noreferrer">信</a></p>',
    )
    expect(body('[点我](javascript:alert(1)) [本地](./CHANGELOG.md)')).toBe('<p>点我 本地</p>')
  })

  it('links bare URLs without the punctuation after them or the Chinese running into them', () => {
    expect(body('见https://example.com/a?b=1了解。看 https://example.com/x.')).toBe(
      '<p>见<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">https://example.com/a?b=1</a>了解。'
      + '看 <a href="https://example.com/x" target="_blank" rel="noopener noreferrer">https://example.com/x</a>.</p>',
    )
  })

  it('loads images from the package against the base, and http(s) ones as they are', () => {
    expect(body('![演示](demo.png) ![](./a/b.gif) ![远程](https://example.com/c.png)')).toBe(
      `<p><img src="${BASE}demo.png" alt="演示" loading="lazy"/> <img src="${BASE}a/b.gif" alt="" loading="lazy"/> `
      + '<img src="https://example.com/c.png" alt="远程" loading="lazy"/></p>',
    )
    // Paths of the WebUI itself and other schemes are not loaded
    expect(body('![a](/api/config) ![b](data:image/png;base64,AAAA)')).toBe('<p><span>[a]</span> <span>[b]</span></p>')
  })

  it('reads headings, line breaks and inline styles', () => {
    expect(body('# 标题\n\n第一行\n第二行 **粗** *斜* ~~删~~ `a<b>`\n\n副标题\n---')).toBe(
      '<h1>标题</h1><p>第一行<br/>第二行 <strong>粗</strong> <em>斜</em> <del>删</del> <code>a&lt;b&gt;</code></p><h2>副标题</h2>',
    )
  })

  it('leaves underscores inside words alone', () => {
    expect(body('foo_bar_baz 和 _斜体_')).toBe('<p>foo_bar_baz 和 <em>斜体</em></p>')
  })

  it('nests lists by indent and keeps an ordered list\'s start', () => {
    expect(body('- 一\n  - 一点一\n- 二\n\n3. 三\n4. 四')).toBe(
      '<ul><li><p>一</p><ul><li><p>一点一</p></li></ul></li><li><p>二</p></li></ul><ol start="3"><li><p>三</p></li><li><p>四</p></li></ol>',
    )
  })

  it('keeps a list going across blank lines between its items', () => {
    expect(body('- a\n\n- b')).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>')
  })

  it('keeps fenced code as it is', () => {
    expect(body('```js\nconst a = **b** <c>\n  indented\n```')).toBe('<pre><code>const a = **b** &lt;c&gt;\n  indented</code></pre>')
  })

  it('reads quotes, rules and pipe tables', () => {
    expect(body('> 引用\n\n***\n\n| 指令 | 说明 |\n|:--|--:|\n| `/help` | 帮助 |')).toBe(
      '<blockquote><p>引用</p></blockquote><hr/>'
      + '<div><table><thead><tr><th style="text-align:left">指令</th><th style="text-align:right">说明</th></tr></thead>'
      + '<tbody><tr><td style="text-align:left"><code>/help</code></td><td style="text-align:right">帮助</td></tr></tbody></table></div>',
    )
  })
})
