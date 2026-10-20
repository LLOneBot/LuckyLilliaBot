import { describe, expect, it } from 'vitest'
import { resolvePluginSpecifier, ResolverState } from '@/plugin/resolve-hook'

const state: ResolverState = {
  shared: new Map([['cordis', 'file:///host/node_modules/cordis/lib/index.js']]),
  roots: ['file:///data/plugins/foo/', 'file:///data/plugins/foo-bar/'],
}

const context = (parentURL?: string) => ({ conditions: ['node', 'import'], importAttributes: {}, parentURL })

// Mimics the default resolver for relative and package specifiers
const nextResolve = (specifier: string, ctx?: { parentURL?: string }) => {
  if (specifier.startsWith('.')) return { url: new URL(specifier, ctx?.parentURL).href }
  return { url: `file:///host/node_modules/${specifier}/index.js` }
}

describe('resolvePluginSpecifier', () => {
  it('pins shared packages to the host copy from anywhere', () => {
    expect(resolvePluginSpecifier(state, 'cordis', context('file:///data/plugins/foo/index.js?v=3'), nextResolve))
      .toEqual({ url: 'file:///host/node_modules/cordis/lib/index.js', shortCircuit: true })
    expect(resolvePluginSpecifier(state, 'cordis', context('file:///host/src/main.ts'), nextResolve).url)
      .toBe('file:///host/node_modules/cordis/lib/index.js')
  })

  it('copies the reload epoch to modules inside the same package', () => {
    expect(resolvePluginSpecifier(state, './lib/util.js', context('file:///data/plugins/foo/index.js?v=3'), nextResolve).url)
      .toBe('file:///data/plugins/foo/lib/util.js?v=3')
  })

  it('leaves imports outside the package alone', () => {
    expect(resolvePluginSpecifier(state, 'ws', context('file:///data/plugins/foo/index.js?v=3'), nextResolve).url)
      .toBe('file:///host/node_modules/ws/index.js')
    expect(resolvePluginSpecifier(state, '../foo-bar/x.js', context('file:///data/plugins/foo/index.js?v=3'), nextResolve).url)
      .toBe('file:///data/plugins/foo-bar/x.js')
  })

  it('does nothing for modules that were not loaded through a reload epoch', () => {
    expect(resolvePluginSpecifier(state, './a.js', context('file:///data/plugins/foo/index.js'), nextResolve).url)
      .toBe('file:///data/plugins/foo/a.js')
    expect(resolvePluginSpecifier(state, 'ws', context(undefined), nextResolve).url)
      .toBe('file:///host/node_modules/ws/index.js')
  })

  it('matches the longest package root', () => {
    expect(resolvePluginSpecifier(state, './x.js', context('file:///data/plugins/foo-bar/index.js?v=9'), nextResolve).url)
      .toBe('file:///data/plugins/foo-bar/x.js?v=9')
  })
})
