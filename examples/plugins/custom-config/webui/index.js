import { createElement as h, useState } from 'react'

/** Gets the whole config with defaults filled in; saving and validation stay with the WebUI and the bot. */
function WordsEditor({ value, onChange, errors }) {
  const [draft, setDraft] = useState('')
  const words = value?.words ?? []
  const update = patch => onChange({ ...value, ...patch })
  const add = () => {
    const word = draft.trim()
    if (!word || words.includes(word)) return
    update({ words: [...words, word] })
    setDraft('')
  }
  const errorOf = key => Object.entries(errors).find(([path]) => path === key || path.startsWith(`${key}.`))?.[1]

  return h('div', { style: { display: 'grid', gap: 16 } },
    h('div', null,
      h('div', { className: 'text-theme', style: { fontWeight: 500, marginBottom: 8 } }, '要替换掉的词（点一下删除）'),
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
        words.length === 0 && h('span', { className: 'text-theme-hint' }, '还没有'),
        words.map(word => h('button', {
          key: word,
          type: 'button',
          className: 'btn-glass',
          onClick: () => update({ words: words.filter(other => other !== word) }),
        }, `${word} ×`)),
      ),
      h('div', { style: { display: 'flex', gap: 8, marginTop: 12 } },
        h('input', {
          className: 'input-field',
          value: draft,
          placeholder: '输入后回车添加',
          onChange: event => setDraft(event.target.value),
          onKeyDown: event => event.key === 'Enter' && add(),
        }),
        h('button', { type: 'button', className: 'btn-primary', style: { flexShrink: 0, whiteSpace: 'nowrap' }, onClick: add }, '添加'),
      ),
      errorOf('words') && h('p', { style: { color: 'rgb(239 68 68)', fontSize: 12 } }, errorOf('words')),
    ),
    h('label', { style: { display: 'grid', gap: 8 } },
      h('span', { className: 'text-theme', style: { fontWeight: 500 } }, '替换成'),
      h('input', { className: 'input-field', value: value?.replacement ?? '', onChange: event => update({ replacement: event.target.value }) }),
      errorOf('replacement') && h('span', { style: { color: 'rgb(239 68 68)', fontSize: 12 } }, errorOf('replacement')),
    ),
  )
}

export default function apply(ctx) {
  ctx.config(WordsEditor)
}
