import h from '@satorijs/element'
import { Context } from 'cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Bot, Feature } from '@luckylillia/plugin-sdk'
import BotsService from '@/universal/bots'
import { fallback, markdownToElements } from '@/universal/fallback'

function bot(features: Feature[] = []): Bot {
  return { platform: 'test', selfId: '1', sid: 'test:1', status: 1, features, sendMessage: async () => [] }
}

const markup = (elements: h[]) => elements.join('')

let ctx: Context

beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(BotsService)
})

describe('markdown fallback', () => {
  it('keeps emphasis, links, code and images as elements, every block a paragraph', () => {
    expect(markup(markdownToElements('# 标题\n**粗**和*斜*、~~删~~、`a_b`\n[链接](https://e.com) ![图](https://e.com/a.png)')))
      .toBe('<p><b>标题</b></p><p><b>粗</b>和<i>斜</i>、<s>删</s>、<code>a_b</code><br/><a href="https://e.com">链接</a> <img src="https://e.com/a.png"/></p>')
  })

  it('marks list items and quotes with text, and leaves code and words with underscores alone', () => {
    expect(markup(markdownToElements('- 一\n  - 二\n1. 三\n> 引用\n\n```\n**x**\n```\nsnake_case_name \\*no\\*'))).toBe(
      '<p>• 一</p><p>  • 二</p><p>1. 三</p><p>｜引用</p><p><code>**x**</code></p><p>snake_case_name *no*</p>',
    )
  })

  it('writes a link to itself as the link alone', () => {
    expect(markup(markdownToElements('[https://e.com](https://e.com) <https://f.com>'))).toBe('<p>https://e.com https://f.com</p>')
  })

  it('reads the source from the content attribute or the children', () => {
    expect(markup(fallback(h('markdown', { content: '**a**' })))).toBe('<p><b>a</b></p>')
    expect(markup(fallback(h('markdown', {}, '**a**\n**b**')))).toBe('<p><b>a</b><br/><b>b</b></p>')
  })
})

describe('button fallback', () => {
  it('asks to send what a command button sends, links the link buttons and drops callbacks', () => {
    const row = h('button-group', {}, [
      h('button', {}, '签到'),
      h('button', { text: '/sign' }, '每日签到'),
      h('button', { type: 'link', href: 'https://e.com' }, '官网'),
      h('button', { type: 'link', href: 'https://f.com' }),
      h('button', { type: 'action', id: 'vote' }, '投票'),
      h('button', { action: { type: 1, data: 'd' } }, '回调'),
      h('button', { renderData: { label: '平台' }, action: { type: 2, data: '/p' } }),
    ])
    expect(markup(fallback(row))).toBe(
      '<p>「签到」  每日签到（发送「/sign」）  <a href="https://e.com">官网</a>  https://f.com  平台（发送「/p」）</p>',
    )
  })

  it('leaves nothing of a row with only callbacks', () => {
    expect(fallback(h('button-group', {}, [h('button', { type: 'action', id: 'x' }, 'X')]))).toEqual([])
  })
})

describe('card and face fallback', () => {
  it('shows the title with the link, the description and the image', () => {
    expect(markup(fallback(h('card', { title: '标题', url: 'https://e.com', desc: '描述', image: 'https://e.com/a.png' }))))
      .toBe('<p><a href="https://e.com">标题</a></p><p>描述</p><img src="https://e.com/a.png"/>')
    expect(markup(fallback(h('card', { url: 'https://e.com' })))).toBe('<p>https://e.com</p>')
  })

  it('writes a face by its name', () => {
    expect(markup(fallback(h('face', { id: '13', name: '呲牙' })))).toBe('[呲牙]')
    expect(markup(fallback(h('face', { id: '13' })))).toBe('[表情]')
  })
})

describe('sending through ctx.bots.beforeSend', () => {
  const content = () => [
    h('markdown', {}, '**a**'),
    h('p', {}, [h('face', { id: '13', name: '呲牙' })]),
    h('button', {}, 'x'),
    h.text(' '),
    h('button', {}, 'y'),
    h('card', { title: 't', url: 'https://e.com' }),
  ]

  it('swaps what the bot cannot send for its fallback, nested ones too, loose buttons as one row', async () => {
    expect(markup(await ctx.bots.beforeSend(bot(), 'c', content()))).toBe(
      '<p><b>a</b></p><p>[呲牙]</p><p>「x」  「y」</p><p><a href="https://e.com">t</a></p>',
    )
  })

  it('leaves what the bot declares, and takes a bot declaring nothing as one without any', async () => {
    const all: Feature[] = ['message.markdown', 'message.button', 'message.card', 'message.face']
    expect(markup(await ctx.bots.beforeSend(bot(all), 'c', content()))).toBe(markup(content()))
    const bare = { ...bot(), features: undefined } as unknown as Bot
    expect(markup(await ctx.bots.beforeSend(bare, 'c', [h('face', { id: '1' })]))).toBe('[表情]')
  })

  it('lets a plugin send its own fallback first, as it is, and drop an element with an empty one', async () => {
    const seen: string[] = []
    ctx.on('bot/fallback', (_bot, channelId, element) => {
      seen.push(`${channelId}:${element.type}`)
      if (element.type === 'markdown') return h.image('https://e.com/rendered.png')
      if (element.type === 'card') return ''
    })
    expect(markup(await ctx.bots.beforeSend(bot(), 'c', content()))).toBe(
      '<img src="https://e.com/rendered.png"/><p>[呲牙]</p><p>「x」  「y」</p>',
    )
    expect(seen).toEqual(['c:markdown', 'c:face', 'c:button-group', 'c:card'])
  })

  it('falls back after bot/before-send, so what it adds is covered', async () => {
    ctx.on('bot/before-send', (_bot, _channelId, content, next) => {
      content.push(h('face', { id: '13', name: '呲牙' }))
      return next()
    })
    expect(markup(await ctx.bots.beforeSend(bot(), 'c', [h.text('hi')]))).toBe('hi[呲牙]')
  })
})
