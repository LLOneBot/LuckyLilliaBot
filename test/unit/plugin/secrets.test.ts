import Schema from 'schemastery'
import { describe, expect, it } from 'vitest'
import { hydrate } from '@/common/schema/model'
import { maskSecrets, restoreSecrets, SECRET_MASK, secretPaths } from '@/plugin/host/secrets'

const nodeOf = (schema: Schema) => hydrate(JSON.parse(JSON.stringify(schema)))
const salt = new Uint8Array(16)

describe('secretPaths', () => {
  it('finds the role(\'secret\') fields of objects, lists, dicts, unions and tuples', () => {
    const schema = Schema.object({
      token: Schema.string().role('secret'),
      name: Schema.string(),
      smtp: Schema.object({ auth: Schema.object({ pass: Schema.string().role('secret') }) }),
      ais: Schema.array(Schema.object({ name: Schema.string(), apiKey: Schema.string().role('secret') })),
      keys: Schema.dict(Schema.string().role('secret')),
      upstream: Schema.union([Schema.const(false), Schema.object({ secret: Schema.string().role('secret') })]),
      pair: Schema.tuple([Schema.string(), Schema.string().role('secret')]),
      mixed: Schema.intersect([Schema.object({ a: Schema.string() }), Schema.object({ b: Schema.string().role('secret') })]),
    })
    expect(secretPaths(nodeOf(schema)).sort()).toEqual([
      'ais.*.apiKey', 'keys.*', 'mixed.b', 'pair.1', 'smtp.auth.pass', 'token', 'upstream.secret',
    ])
  })

  it('ends on a schema that refers back to itself, with what it found before the repeat', () => {
    interface Tree { key: string; children: Tree[] }
    const tree: Schema<Tree> = Schema.lazy(() => Schema.object({ key: Schema.string().role('secret'), children: Schema.array(tree) }))
    expect(secretPaths(nodeOf(tree))).toEqual(['key'])
    expect(secretPaths(null)).toEqual([])
  })
})

describe('maskSecrets / restoreSecrets', () => {
  const stored = { token: 'tok', ais: [{ name: 'a', key: 'ka' }, { name: 'b', key: 'kb' }, { name: 'c', key: '' }] }
  const paths = ['token', 'ais.*.key']

  it('masks fixed places plainly and list items with a token, leaving blanks blank', () => {
    const masked = maskSecrets(stored, paths, salt) as typeof stored
    expect(masked.token).toBe(SECRET_MASK)
    expect(masked.ais.map(ai => ai.key)).toEqual([expect.stringMatching(/^\*{8}#[0-9a-f]{8}$/), expect.stringMatching(/^\*{8}#[0-9a-f]{8}$/), ''])
    expect(masked.ais[0].key).not.toBe(masked.ais[1].key)
    expect(stored.ais[0].key).toBe('ka')
  })

  it('puts each secret back with its own item, wherever it moved', () => {
    const masked = maskSecrets(stored, paths, salt) as typeof stored
    const sent = { token: '', ais: [masked.ais[1], { name: 'd', key: 'kd' }, masked.ais[0]] }
    expect(restoreSecrets(sent, stored, paths, [], salt)).toEqual({
      value: { token: 'tok', ais: [{ name: 'b', key: 'kb' }, { name: 'd', key: 'kd' }, { name: 'a', key: 'ka' }] },
      issues: [],
    })
  })

  it('empties a blank in a list and a cleared fixed place, and takes a bare mask in a list as the same place', () => {
    const sent = { token: SECRET_MASK, ais: [{ name: 'a', key: '' }, { name: 'b', key: SECRET_MASK }] }
    expect(restoreSecrets(sent, stored, paths, ['token'], salt).value).toEqual({
      token: '', ais: [{ name: 'a', key: '' }, { name: 'b', key: 'kb' }],
    })
  })

  it('refuses a token that names nothing stored', () => {
    const sent = { token: 'new', ais: [{ name: 'a', key: `${SECRET_MASK}#00000000` }] }
    expect(restoreSecrets(sent, stored, paths, [], salt).issues).toEqual([{ path: ['ais', '0', 'key'], message: expect.any(String) }])
    // Another salt (a restart) makes every token a stranger
    const masked = maskSecrets(stored, paths, salt) as typeof stored
    expect(restoreSecrets({ ais: [masked.ais[0]] }, stored, paths, [], new Uint8Array(16).fill(1)).issues).toHaveLength(1)
  })
})
