import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SDK_EXPORTS } from '@/plugin/internal/service/webui/FE/plugin-host/sdkExports'

// What `@luckylillia/plugin-sdk/webui` declares, what the WebUI supplies, and what the import map shim re-exports.
// Read from the source: the runtime module pulls in the WebUI, which needs a DOM.
const read = (file: string) => readFileSync(path.resolve(import.meta.dirname, '../../..', file), 'utf8')

const declared = [...read('packages/plugin-sdk/src/webui.ts').matchAll(/^export declare (?:function|const) (\w+)/gm)]
  .map(match => match[1])

const runtime = read('src/plugin/internal/service/webui/FE/plugin-host/sdk.tsx')
const supplied = [
  ...[...runtime.matchAll(/^export (?:const|function) (\w+)/gm)].map(match => match[1]),
  ...[...runtime.matchAll(/^export \{ ([^}]+) \}/gm)].flatMap(match => match[1].split(',').map(name => name.trim())),
]

describe('plugin SDK runtime', () => {
  it('supplies every declared value, and the shim re-exports all of them', () => {
    expect([...supplied].sort()).toEqual([...declared].sort())
    expect([...SDK_EXPORTS].sort()).toEqual([...declared].sort())
  })
})
