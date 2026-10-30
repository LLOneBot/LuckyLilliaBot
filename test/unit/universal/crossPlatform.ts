import h from '@satorijs/element'

// What a plugin may send to any bot. Every platform's tests say what it sends of each (ntqq.test.ts,
// qqofficial/features.test.ts) and check that they cover all of them; `image` is a picture that platform can reach.

export function crossPlatform(image: string): Record<string, h[]> {
  return {
    markdown: [h('markdown', {}, '# 标题\n**粗体** 和 [链接](https://example.com)')],
    buttons: [
      h.text('选一个'),
      h('button-group', {}, [
        h('button', {}, '签到'),
        h('button', { text: '/sign' }, '每日签到'),
        h('button', { type: 'link', href: 'https://example.com' }, '官网'),
        h('button', { type: 'action', id: 'vote' }, '投票'),
      ]),
    ],
    card: [h('card', { title: '标题', url: 'https://example.com/a', desc: '描述', image })],
    face: [h.text('好的'), h('face', { id: '13', name: '呲牙' })],
  }
}
