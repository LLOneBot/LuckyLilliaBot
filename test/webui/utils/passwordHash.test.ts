import { describe, it, expect } from 'vitest'
import { hashPassword } from '@/plugin/internal/service/webui/BE/passwordHash'
import crypto from 'node:crypto'

describe('hashPassword', () => {
  it('returns SHA-256 hex digest', () => {
    const input = 'my-secret-token'
    const expected = crypto.createHash('sha256').update(input).digest('hex')
    expect(hashPassword(input)).toBe(expected)
  })

  it('returns consistent hash for same input', () => {
    expect(hashPassword('test')).toBe(hashPassword('test'))
  })

  it('returns different hashes for different inputs', () => {
    expect(hashPassword('aaa')).not.toBe(hashPassword('bbb'))
  })

  it('handles empty string', () => {
    const expected = crypto.createHash('sha256').update('').digest('hex')
    expect(hashPassword('')).toBe(expected)
  })

  it('handles unicode characters', () => {
    const result = hashPassword('你好世界🌍')
    expect(result).toHaveLength(64) // SHA-256 hex is 64 chars
  })
})
