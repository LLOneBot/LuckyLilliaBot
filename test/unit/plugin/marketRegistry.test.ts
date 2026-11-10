import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Context } from 'cordis'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMarketRoutes, Market } from '@/plugin/internal/tool/market'
import { Catalog } from '@/plugin/internal/tool/market/catalog'
import { Registry, RegistryError, type PackageVersion, type Packument } from '@/plugin/internal/tool/market/registry'

const archive = Buffer.from('downloaded package')
const shasum = createHash('sha1').update(archive).digest('hex')
let server: Server
let url: string

function version(name = 'example', resource = 'tarball'): PackageVersion {
  return { name, version: '1.0.0', dist: { tarball: `${url}/${resource}`, shasum } }
}

function document(name: string, resource: string): Packument {
  return { name, 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': version(name, resource) } }
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const name = request.url!.slice(1)
    response.setHeader('connection', 'close')
    if (name === 'unavailable') {
      request.socket.destroy()
      return
    }
    if (name === 'invalid-json') {
      response.setHeader('content-type', 'application/json')
      response.end('{invalid json}')
      return
    }
    if (name === 'truncated') {
      response.setHeader('content-length', 100)
      response.end('short')
      return
    }
    if (name.startsWith('status-')) {
      response.writeHead(Number(name.slice(7)))
      response.end('upstream error')
      return
    }
    if (name === 'tarball' || name === 'corrupt') {
      response.end(name === 'tarball' ? archive : Buffer.from('corrupted package'))
      return
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(document(name, name.replace(/^catalog-/, ''))))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('registry failures', () => {
  it.each(['unavailable', 'invalid-json', 'truncated'])('wraps metadata failures from %s with package and registry context', async resource => {
    const failure = new Registry(url).packument(resource)
    await expect(failure).rejects.toBeInstanceOf(RegistryError)
    await expect(failure).rejects.toThrow(`package ${resource}:`)
    await expect(failure).rejects.toThrow(url)
  })

  it.each([undefined, 1024])('wraps download and integrity failures with a byte limit of %s', async maxBytes => {
    for (const resource of ['unavailable', 'truncated', 'corrupt']) {
      const failure = new Registry(url).tarball(version('example', resource), maxBytes)
      await expect(failure).rejects.toBeInstanceOf(RegistryError)
      await expect(failure).rejects.toThrow('example@1.0.0:')
      await expect(failure).rejects.toThrow(`${url}/${resource}`)
    }
  })

  it('still reads metadata and verifies successful downloads', async () => {
    const registry = new Registry(url)
    await expect(registry.packument('catalog-tarball')).resolves.toEqual(document('catalog-tarball', 'tarball'))
    await expect(registry.tarball(version())).resolves.toEqual(archive)
    await expect(registry.tarball(version(), archive.length)).resolves.toEqual(archive)
  })

  it.each([
    ['unavailable', 502],
    ['invalid-json', 502],
    ['truncated', 502],
    ['status-503', 502],
    ['status-404', 404],
    ['catalog-unavailable', 502],
    ['catalog-truncated', 502],
    ['catalog-corrupt', 502],
    ['catalog-status-503', 502],
    ['catalog-status-404', 404],
  ] as const)('maps catalog failure %s to HTTP %i', async (name, status) => {
    const warn = vi.fn()
    const ctx = { plugins: { packageList: () => [], builtinPackageList: () => [] }, logger: () => ({ warn }) } as unknown as Context
    const registry = new Registry(url)
    const market = new Market(ctx, registry, '.tmp/unused-registry-test', new Catalog(registry, name))
    const response = await createMarketRoutes(ctx, market).request('/search')
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ success: false, message: expect.any(String) })
    expect(warn).not.toHaveBeenCalled()
  })
})
