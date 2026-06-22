import { describe, expect, it } from 'vitest'
import { createRemotePathMapper, mapLocalPathToRemote, mapRemotePathToLocal } from '@/common/utils/pathMapping'
import { RemotePathMapping } from '@/common/types'

describe('remote path mappings', () => {
  it('maps a PMHQ container path to a host-mounted local path', () => {
    const mappings: RemotePathMapping[] = [{
      remotePrefix: '/root/.config/QQ',
      localPrefix: '/var/lib/containers/storage/volumes/llbot_qq/_data',
      remoteStyle: 'posix',
      localStyle: 'posix',
    }]

    const mapper = createRemotePathMapper(mappings)

    expect(mapper.remotePathToLocal('/root/.config/QQ/nt_data/Pic/Ori/a.png'))
      .toBe('/var/lib/containers/storage/volumes/llbot_qq/_data/nt_data/Pic/Ori/a.png')
  })

  it('uses the longest matching prefix and enforces path boundaries', () => {
    const mappings: RemotePathMapping[] = [
      {
        remotePrefix: '/root/.config/QQ',
        localPrefix: '/host/qq',
        remoteStyle: 'posix',
        localStyle: 'posix',
      },
      {
        remotePrefix: '/root/.config/QQ/nt_data',
        localPrefix: '/host/qq-data',
        remoteStyle: 'posix',
        localStyle: 'posix',
      },
    ]

    const mapper = createRemotePathMapper(mappings)

    expect(mapper.remotePathToLocal('/root/.config/QQ/nt_data/Pic/Ori/a.png'))
      .toBe('/host/qq-data/Pic/Ori/a.png')
    expect(mapper.remotePathToLocal('/root/.config/QQ2/nt_data/Pic/Ori/a.png'))
      .toBe('/root/.config/QQ2/nt_data/Pic/Ori/a.png')
  })

  it('maps between POSIX and Windows path styles', () => {
    const mappings: RemotePathMapping[] = [{
      remotePrefix: '/root/.config/QQ',
      localPrefix: 'D:\\QQProfile',
      remoteStyle: 'posix',
      localStyle: 'win32',
    }]

    const mapper = createRemotePathMapper(mappings)

    expect(mapper.remotePathToLocal('/root/.config/QQ/nt_data/Pic/Ori/a.png'))
      .toBe('D:\\QQProfile\\nt_data\\Pic\\Ori\\a.png')
    expect(mapper.localPathToRemote('d:\\qqprofile\\nt_data\\Pic\\Ori\\a.png'))
      .toBe('/root/.config/QQ/nt_data/Pic/Ori/a.png')
  })

  it('normalizes mapping prefixes when the mapper is created', () => {
    const mapper = createRemotePathMapper([{
      remotePrefix: '/root/.config/QQ/',
      localPrefix: '/host/qq/',
      remoteStyle: 'posix',
      localStyle: 'posix',
    }])

    expect(mapper.remotePathToLocal('/root/.config/QQ/nt_data/Pic/Ori/a.png'))
      .toBe('/host/qq/nt_data/Pic/Ori/a.png')
    expect(mapper.localPathToRemote('/host/qq/nt_data/Pic/Ori/a.png'))
      .toBe('/root/.config/QQ/nt_data/Pic/Ori/a.png')
  })

  it('keeps one-shot mapping helpers for direct callers', () => {
    const mappings: RemotePathMapping[] = [{
      remotePrefix: '/root/.config/QQ',
      localPrefix: 'D:\\QQProfile',
      remoteStyle: 'posix',
      localStyle: 'win32',
    }]

    expect(mapRemotePathToLocal('/root/.config/QQ/nt_data/Pic/Ori/a.png', mappings))
      .toBe('D:\\QQProfile\\nt_data\\Pic\\Ori\\a.png')
    expect(mapLocalPathToRemote('D:\\QQProfile\\nt_data\\Pic\\Ori\\a.png', mappings))
      .toBe('/root/.config/QQ/nt_data/Pic/Ori/a.png')
  })
})
