import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import Busboy from 'busboy'
import { ArchiveError } from './archive'

/** Keep queued uploads on disk, and remove them after installation or any upload/validation failure. */
export async function withLocalUpload<T>(request: Request, root: string, install: (archive: string, filename: string) => Promise<T>): Promise<T> {
  let parser: ReturnType<typeof Busboy>
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (!/^multipart\/form-data(?:;|$)/i.test(contentType) || !request.body) throw new Error('multipart body required')
    parser = Busboy({
      headers: { 'content-type': contentType },
      defParamCharset: 'utf8',
      // Only the confirmation field is bounded; the archive streams to disk without a file-size limit.
      limits: { files: 1, fields: 1, fieldSize: 16 },
    })
  } catch {
    throw new ArchiveError('请使用表单上传插件压缩包')
  }
  await mkdir(root, { recursive: true })
  const temporary = await mkdtemp(path.join(root, '.market-upload-'))
  const archive = path.join(temporary, 'archive')
  let filename: string | undefined
  let confirmed = false
  let invalid: ArchiveError | undefined
  let writing: Promise<void> | undefined
  let writeError: unknown
  parser.on('field', (name, value, info) => {
    if (name !== 'confirm' || info.nameTruncated || info.valueTruncated || value !== 'true') {
      invalid = new ArchiveError('请先确认本地安装插件的风险')
    } else confirmed = true
  })
  parser.on('fieldsLimit', () => { invalid = new ArchiveError('请只提交一次本地安装风险确认') })
  parser.on('filesLimit', () => { invalid = new ArchiveError('请选择一个插件压缩包') })
  parser.on('file', (name, stream, info) => {
    if (name !== 'file' || !info.filename) {
      invalid = new ArchiveError('请选择一个插件压缩包')
      stream.resume()
      return
    }
    filename = info.filename
    writing = pipeline(stream, createWriteStream(archive, { flags: 'wx' }))
    writing.catch(error => {
      writeError = error
      parser.destroy(error)
    })
  })
  try {
    try {
      await pipeline(Readable.fromWeb(request.body as ReadableStream<Uint8Array>), parser, { signal: request.signal })
      await writing
    } catch (error) {
      // Busboy destroys the active file stream when parsing or the request fails. Wait for its writer to close.
      await writing?.catch(() => {})
      if (['ENOSPC', 'EDQUOT', 'EACCES', 'EPERM', 'EIO'].includes((writeError as NodeJS.ErrnoException | undefined)?.code ?? '')) throw writeError
      throw new ArchiveError(`插件压缩包上传失败：${error instanceof Error ? error.message : String(error)}`)
    }
    if (invalid) throw invalid
    if (!confirmed) throw new ArchiveError('请先确认本地安装插件的风险')
    if (!filename) throw new ArchiveError('请选择一个插件压缩包')
    return await install(archive, filename)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
