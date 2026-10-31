import { createHash, randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from 'cordis'
import { getWavFileInfo, isSilk, isWav, encode } from 'silk-wasm'
import { TEMP_DIR } from '@/common/globalVars'
import { imageSize } from '@/common/image-size/lib'
import { encodeSilk } from '@/common/utils/audio'
import { ApiError, QQOfficialApi } from './api'
import { FileType, UploadResponse } from './types'

// file_data takes at most 5 MB; bigger files go through the chunked upload
const FILE_DATA_LIMIT = 5 * 1024 * 1024
// upload_prepare wants the md5 of the first 10002432 bytes as well
const MD5_10M_SIZE = 10002432
/** The platform could not download the URL it was given */
const DOWNLOAD_FAILED = 850026
/** upload_part_finish: a transient error of the storage channel */
const PART_RETRYABLE = 40093001

interface MediaData {
  data: Buffer
  name: string
}

/**
 * Uploads one medium for a group (`/v2/groups/<openid>`) or a user (`/v2/users/<openid>`) and returns its
 * `file_info`. A remote URL is handed to the platform to fetch, falling back to sending the bytes.
 */
export async function uploadMedia(ctx: Context, api: QQOfficialApi, base: string, type: number, src: string, name?: string): Promise<string> {
  // Voice must be silk, which only the bytes can be converted to
  if (/^https?:\/\//i.test(src) && type !== FileType.Audio) {
    try {
      return (await api.request<UploadResponse>('POST', `${base}/files`, { file_type: type, url: src, srv_send_msg: false })).file_info
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== DOWNLOAD_FAILED) throw e
    }
  }
  const media = await loadMedia(src)
  if (type === FileType.Audio) media.data = await toSilk(ctx, media.data)
  const fileName = name || media.name
  if (media.data.length <= FILE_DATA_LIMIT) {
    return (await api.request<UploadResponse>('POST', `${base}/files`, {
      file_type: type,
      file_data: media.data.toString('base64'),
      file_name: fileName,
      srv_send_msg: false,
    })).file_info
  }
  return await uploadChunked(api, base, type, media.data, fileName)
}

/** The size of an image on the web, read from its bytes; undefined when it cannot be read in time */
export async function webImageSize(url: string): Promise<{ width: number; height: number } | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return
    const { width, height } = imageSize(new Uint8Array(await res.arrayBuffer()))
    return width && height ? { width, height } : undefined
  } catch {}
}

export async function loadMedia(src: string): Promise<MediaData> {
  if (src.startsWith('data:')) {
    const capture = /^data:[^,]*?(;base64)?,(.*)$/s.exec(src)
    if (!capture) throw new Error('无法解析的 data URL')
    return { data: Buffer.from(decodeURIComponent(capture[2]), capture[1] ? 'base64' : 'utf8'), name: 'file' }
  }
  if (src.startsWith('base64://')) return { data: Buffer.from(src.slice('base64://'.length), 'base64'), name: 'file' }
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`下载 ${src} 失败: ${res.status} ${res.statusText}`)
    return { data: Buffer.from(await res.arrayBuffer()), name: path.basename(new URL(res.url || src).pathname) || 'file' }
  }
  const file = src.startsWith('file://') ? fileURLToPath(src) : src
  return { data: await readFile(file), name: path.basename(file) }
}

async function toSilk(ctx: Context, data: Buffer): Promise<Buffer> {
  if (isSilk(data)) return data
  const rates = [8000, 12000, 16000, 24000, 32000, 44100, 48000]
  if (isWav(data) && rates.includes(getWavFileInfo(data).fmt.sampleRate)) {
    return Buffer.from((await encode(data, 0)).data)
  }
  // Anything else goes through ffmpeg, which works on files
  const input = path.join(TEMP_DIR, randomUUID())
  await writeFile(input, data)
  try {
    const { path: output } = await encodeSilk(ctx, input)
    try {
      return await readFile(output)
    } finally {
      if (output !== input) await rm(output, { force: true })
    }
  } finally {
    await rm(input, { force: true })
  }
}

interface UploadPrepareResponse {
  upload_id: string
  block_size: number | string
  parts: { index: number; presigned_url: string }[]
  /** Seconds to keep retrying upload_part_finish on PART_RETRYABLE */
  retry_timeout?: number | string
}

// upload_prepare, a PUT of each part to its presigned URL, upload_part_finish per part, then /files with the upload_id
async function uploadChunked(api: QQOfficialApi, base: string, type: number, data: Buffer, name: string): Promise<string> {
  const md5 = createHash('md5').update(data).digest('hex')
  const prepare = await api.request<UploadPrepareResponse>('POST', `${base}/upload_prepare`, {
    file_type: type,
    file_name: name,
    file_size: data.length,
    md5,
    sha1: createHash('sha1').update(data).digest('hex'),
    md5_10m: data.length > MD5_10M_SIZE ? createHash('md5').update(data.subarray(0, MD5_10M_SIZE)).digest('hex') : md5,
  })
  const blockSize = Number(prepare.block_size)
  const retryFor = Math.min(Number(prepare.retry_timeout ?? 120), 600) * 1000
  for (const part of prepare.parts) {
    const block = data.subarray((part.index - 1) * blockSize, part.index * blockSize)
    await withRetry(async () => {
      const res = await fetch(part.presigned_url, {
        method: 'PUT',
        body: new Uint8Array(block),
        signal: AbortSignal.timeout(300_000),
      })
      if (!res.ok) throw new Error(`上传第 ${part.index} 块失败: ${res.status} ${res.statusText}`)
    })
    const finish = {
      upload_id: prepare.upload_id,
      part_index: part.index,
      block_size: block.length,
      md5: createHash('md5').update(block).digest('hex'),
    }
    const deadline = Date.now() + retryFor
    for (;;) {
      try {
        await api.request('POST', `${base}/upload_part_finish`, finish)
        break
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== PART_RETRYABLE || Date.now() > deadline) throw e
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }
  return (await api.request<UploadResponse>('POST', `${base}/files`, { upload_id: prepare.upload_id })).file_info
}

async function withRetry(task: () => Promise<void>, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await task()
    } catch (e) {
      if (i >= attempts) throw e
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** (i - 1)))
    }
  }
}
