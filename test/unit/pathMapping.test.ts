import { describe, expect, it } from 'vitest'
import { mapLocalPathToRemote, mapRemotePathToLocal } from '@/common/utils/pathMapping'
import { RemotePathMapping } from '@/common/types'

describe('remote path mappings', () => {
  it('maps a PMHQ container path to a host-mounted local path', () => {
    const mappings: RemotePathMapping[] = [{
      remotePrefix: '/root/.config/QQ',
      localPrefix: '/var/lib/containers/storage/volumes/llbot_qq/_data',
      remoteStyle: 'posix',
      localStyle: 'posix',
    }]

    expect(mapRemotePathToLocal('/root/.config/QQ/nt_data/Pic/Ori/a.png', mappings))
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

    expect(mapRemotePathToLocal('/root/.config/QQ/nt_data/Pic/Ori/a.png', mappings))
      .toBe('/host/qq-data/Pic/Ori/a.png')
    expect(mapRemotePathToLocal('/root/.config/QQ2/nt_data/Pic/Ori/a.png', mappings))
      .toBe('/root/.config/QQ2/nt_data/Pic/Ori/a.png')
  })

  it('maps between POSIX and Windows path styles', () => {
    const mappings: RemotePathMapping[] = [{
      remotePrefix: '/root/.config/QQ',
      localPrefix: 'D:\\QQProfile',
      remoteStyle: 'posix',
      localStyle: 'win32',
    }]

    expect(mapRemotePathToLocal('/root/.config/QQ/nt_data/Pic/Ori/a.png', mappings))
      .toBe('D:\\QQProfile\\nt_data\\Pic\\Ori\\a.png')
    expect(mapLocalPathToRemote('d:\\qqprofile\\nt_data\\Pic\\Ori\\a.png', mappings))
      .toBe('/root/.config/QQ/nt_data/Pic/Ori/a.png')
  })
})
