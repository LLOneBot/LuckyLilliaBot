import { describe, expect, it } from 'vitest'
import { isEqual, stripDefaults, withDefaults } from '@/common/schema/diff'
import { SchemaNode } from '@/common/schema/model'

// Minimal hand-built schema nodes (what hydrate() produces from Schema.toJSON()).
const str = (def = ''): SchemaNode => ({ type: 'string', meta: { default: def } })
const num = (def = 0): SchemaNode => ({ type: 'number', meta: { default: def } })
const obj = (dict: Record<string, SchemaNode>): SchemaNode => ({ type: 'object', meta: {}, dict })
const dict = (inner: SchemaNode): SchemaNode => ({ type: 'dict', meta: { default: {} }, inner })
const arr = (inner: SchemaNode): SchemaNode => ({ type: 'array', meta: { default: [] }, inner })

describe('schema diff', () => {
  describe('object nodes recurse per key', () => {
    const node = obj({ a: str('x'), b: num(1) })
    const defaults = { a: 'x', b: 1 }

    it('stripDefaults keeps only changed keys', () => {
      expect(stripDefaults(node, { a: 'x', b: 2 }, defaults)).toEqual({ b: 2 })
      expect(stripDefaults(node, { a: 'x', b: 1 }, defaults)).toBeUndefined()
    })

    it('withDefaults fills missing keys', () => {
      expect(withDefaults(node, { b: 2 }, defaults)).toEqual({ a: 'x', b: 2 })
    })

    it('round-trips', () => {
      const value = { a: 'y', b: 1 }
      const stored = stripDefaults(node, value, defaults)
      expect(withDefaults(node, stored, defaults)).toEqual(value)
    })
  })

  describe('dict nodes replace wholesale (the bug fix)', () => {
    // dict<object{x}>; default is empty. Entries whose object matches another entry must NOT be dropped.
    const node = dict(obj({ x: num(0) }))
    const defaults = {}

    it('stripDefaults keeps the whole dict, not a per-entry diff', () => {
      const value = { a: { x: 1 }, b: { x: 2 } }
      // value-driven recursion would have dropped entries equal to a default-keyed value; whole-replace keeps all.
      expect(stripDefaults(node, value, defaults)).toEqual(value)
    })

    it('a dict equal to its default strips to undefined', () => {
      expect(stripDefaults(node, {}, defaults)).toBeUndefined()
    })

    it('round-trips a dict whose entries would collide under per-key diff', () => {
      const dictNode = dict(obj({ x: num(9) })) // entry default {x:9}
      const value = { k1: { x: 9 }, k2: { x: 5 } } // k1 equals the entry default
      const stored = stripDefaults(dictNode, value, {})
      // k1 must survive: a per-key diff against {} would not drop it here, but the point is the whole dict is stored
      expect(stored).toEqual(value)
      expect(withDefaults(dictNode, stored, {})).toEqual(value)
    })
  })

  describe('array and union nodes are whole values', () => {
    it('array stores whole when changed, undefined when equal', () => {
      const node = arr(str())
      expect(stripDefaults(node, ['a', 'b'], [])).toEqual(['a', 'b'])
      expect(stripDefaults(node, [], [])).toBeUndefined()
    })

    it('tagged union branch (a plain object) is stored whole, not diffed per key', () => {
      const union: SchemaNode = {
        type: 'union',
        meta: {},
        list: [
          obj({ type: { type: 'const', meta: {}, value: 'ws' }, host: str('localhost') }),
          obj({ type: { type: 'const', meta: {}, value: 'http' }, url: str('') }),
        ],
      }
      const value = { type: 'ws', host: 'localhost' }
      // `type` equals its default; a per-key diff would drop it to { host: 'localhost' }. A union is whole,
      // so the entire branch object (including the matching `type`) is kept.
      expect(stripDefaults(union, value, { type: 'ws', host: 'default-host' })).toEqual(value)
    })
  })

  describe('null node (JSON fallback) keeps value-driven recursion', () => {
    it('recurses plain objects when there is no schema', () => {
      expect(stripDefaults(null, { a: 1, b: 2 }, { a: 1, b: 9 })).toEqual({ b: 2 })
      expect(withDefaults(null, { b: 2 }, { a: 1, b: 9 })).toEqual({ a: 1, b: 2 })
    })
  })

  describe('isEqual', () => {
    it('deep-compares arrays and objects, order-insensitive for object keys', () => {
      expect(isEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
      expect(isEqual([1, 2], [2, 1])).toBe(false)
      expect(isEqual({ a: 1 }, { a: 2 })).toBe(false)
    })
  })
})
