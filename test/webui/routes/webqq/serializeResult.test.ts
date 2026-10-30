import { describe, it, expect } from 'vitest'
import { serializeResult } from '@/plugin/internal/tool/webqq/utils'

describe('serializeResult', () => {
  it('returns null as-is', () => {
    expect(serializeResult(null)).toBeNull()
  })

  it('returns undefined as-is', () => {
    expect(serializeResult(undefined)).toBeUndefined()
  })

  it('passes through primitive types', () => {
    expect(serializeResult(42)).toBe(42)
    expect(serializeResult('hello')).toBe('hello')
    expect(serializeResult(true)).toBe(true)
  })

  it('converts Map to plain object', () => {
    const map = new Map([['a', 1], ['b', 2]])
    expect(serializeResult(map)).toEqual({ a: 1, b: 2 })
  })

  it('handles nested Maps', () => {
    const inner = new Map([['x', 10]])
    const outer = new Map<string, any>([['nested', inner]])
    expect(serializeResult(outer)).toEqual({ nested: { x: 10 } })
  })

  it('serializes arrays with Maps inside', () => {
    const arr = [new Map([['k', 'v']]), 'plain']
    expect(serializeResult(arr)).toEqual([{ k: 'v' }, 'plain'])
  })

  it('handles deeply nested objects', () => {
    const obj = { a: { b: { c: new Map([['d', 1]]) } } }
    expect(serializeResult(obj)).toEqual({ a: { b: { c: { d: 1 } } } })
  })
})
