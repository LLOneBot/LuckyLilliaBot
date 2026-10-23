import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// the shared setup mocks this module for other suites; here we want the real class
vi.mock('@/main/config', async importOriginal => await importOriginal<object>())

const { WebUITokenUtil } = await import('@/main/config')

describe('WebUITokenUtil', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'llbot-token-'))
    file = path.join(dir, 'webui_token.txt')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  // A second apart, so the change shows in the mtime on any filesystem
  const rewrite = (content: string, secondsLater: number) => {
    writeFileSync(file, content)
    const time = new Date(Date.now() + secondsLater * 1000)
    utimesSync(file, time, time)
  }

  it('picks up a password changed on disk while running', () => {
    rewrite('first\n', 0)
    const util = new WebUITokenUtil(file)
    expect(util.getToken()).toBe('first')
    rewrite('second', 5)
    expect(util.getToken()).toBe('second')
  })

  it('keeps the last password when the file goes missing', () => {
    rewrite('kept', 0)
    const util = new WebUITokenUtil(file)
    expect(util.getToken()).toBe('kept')
    rmSync(file)
    expect(util.getToken()).toBe('kept')
  })

  it('is empty before any password was set', () => {
    expect(new WebUITokenUtil(file).getToken()).toBe('')
  })

  it('answers with what it just stored', () => {
    const util = new WebUITokenUtil(file)
    util.setToken('mine ')
    expect(util.getToken()).toBe('mine')
  })
})
