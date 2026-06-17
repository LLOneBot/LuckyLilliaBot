import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ElementType } from '@/ntqqapi/types'
import { NTQQFileApi } from '@/ntqqapi/api/file'

describe('NTQQFileApi', () => {
  it('copies rich media to the mapped local path and keeps the PMHQ path in the send element payload', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'llbot-file-api-'))
    try {
      const inputPath = path.join(tempDir, 'input.txt')
      const localRoot = path.join(tempDir, 'qq-volume')
      const remotePath = '/root/.config/QQ/nt_data/Pic/Ori/input.txt'
      const localMediaPath = path.join(localRoot, 'nt_data/Pic/Ori/input.txt')
      await mkdir(path.dirname(localMediaPath), { recursive: true })
      await writeFile(inputPath, 'mapped-media')

      const api = Object.create(NTQQFileApi.prototype) as NTQQFileApi
      ;(api as any).setRemotePathMappings([{
        remotePrefix: '/root/.config/QQ',
        localPrefix: localRoot,
        remoteStyle: 'posix',
        localStyle: 'posix',
      }])
      api.getRichMediaFilePath = vi.fn(async () => remotePath)

      const uploaded = await api.uploadFile(inputPath, ElementType.Pic)

      expect(uploaded.path).toBe(remotePath)
      expect(uploaded.localPath).toBe(localMediaPath)
      expect(await readFile(localMediaPath, 'utf8')).toBe('mapped-media')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
