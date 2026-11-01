import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderInternal, SDK_INTERNAL } from '../../../scripts/gen-sdk-internal.mts'

describe('the SDK types of bot.internal', () => {
  it('name every method the code makes: run scripts/gen-sdk-internal.mts after adding or dropping one', () => {
    expect(readFileSync(SDK_INTERNAL, 'utf8').split('\r\n').join('\n')).toBe(renderInternal())
  })
})
