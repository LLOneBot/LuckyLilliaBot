import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import path from 'node:path'
import * as fileType from 'file-type'
import { imageSizeFromFile } from '../image-size/lib/fromFile'
import { TEMP_DIR } from '../globalVars'
import { randomUUID, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Context } from 'cordis'

// 定义一个异步函数来检查文件是否存在
export function checkFileReceived(path: string, timeout: number = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    function check() {
      if (fs.existsSync(path)) {
        resolve()
      }
      else if (Date.now() - startTime > timeout) {
        reject(new Error(`文件不存在: ${path}`))
      }
      else {
        setTimeout(check, 200)
      }
    }

    check()
  })
}

export function calculateFileMD5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5')

    // 创建一个流式读取器
    const stream = fs.createReadStream(filePath)

    stream.on('data', (data: Buffer | string) => {
      // 当读取到数据时，更新哈希对象的状态
      hash.update(data)
    })

    stream.on('end', () => {
      // 文件读取完成，计算哈希
      const md5 = hash.digest('hex')
      resolve(md5)
    })

    stream.on('error', (err: Error) => {
      // 处理可能的读取错误
      reject(err)
    })
  })
}

export enum FileUriType {
  Unknown = 0,
  FileURL = 1,
  RemoteURL = 2,
  OneBotBase64 = 3,
  DataURL = 4,
  Path = 5
}

export function checkUriType(uri: string): { type: FileUriType } {
  if (uri.startsWith('base64://')) {
    return { type: FileUriType.OneBotBase64 }
  }
  if (uri.startsWith('data:')) {
    return { type: FileUriType.DataURL }
  }
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return { type: FileUriType.RemoteURL }
  }
  if (uri.startsWith('file://')) {
    return { type: FileUriType.FileURL }
  }
  try {
    if (fs.existsSync(uri)) return { type: FileUriType.Path }
  } catch {
  }
  return { type: FileUriType.Unknown }
}

interface FetchFileRes {
  data: Buffer
  url: string
}

export async function fetchFile(url: string, headersInit?: Record<string, string>): Promise<FetchFileRes> {
  const headers = new Headers({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36',
    'Host': new URL(url).hostname,
    ...headersInit,
  })
  let raw = await fetch(url, { headers }).catch((err) => {
    if (err.cause) {
      throw err.cause
    }
    throw err
  })
  if (raw.status === 403 && !headers.has('Referer')) {
    headers.set('Referer', url)
    raw = await fetch(url, { headers }).catch((err) => {
      if (err.cause) {
        throw err.cause
      }
      throw err
    })
  }
  if (!raw.ok) throw new Error(`statusText: ${raw.statusText}`)
  return {
    data: Buffer.from(await raw.arrayBuffer()),
    url: raw.url,
  }
}

type Uri2LocalRes = {
  success: boolean
  errMsg: string
  fileName: string
  path: string
  isLocal: boolean
}

export async function uri2local(ctx: Context, uri: string, needExt?: boolean): Promise<Uri2LocalRes> {
  const { type } = checkUriType(uri)

  if (type === FileUriType.FileURL) {
    const filePath = fileURLToPath(uri)
    if (!fs.existsSync(filePath)) {
      return { success: false, errMsg: '路径不存在', fileName: '', path: '', isLocal: false }
    }
    const fileName = path.basename(filePath)
    return { success: true, errMsg: '', fileName, path: filePath, isLocal: true }
  }

  if (type === FileUriType.Path) {
    const fileName = path.basename(uri)
    return { success: true, errMsg: '', fileName, path: uri, isLocal: true }
  }

  if (type === FileUriType.RemoteURL) {
    try {
      const res = await fetchFile(uri)
      let fileName = randomUUID()
      let filePath = path.join(TEMP_DIR, fileName)
      await fsPromise.writeFile(filePath, res.data)
      if (needExt) {
        const ext = (await ctx.ntFileApi.getFileType(filePath)).ext
        fileName += `.${ext}`
        const newPath = `${filePath}.${ext}`
        await fsPromise.rename(filePath, newPath)
        filePath = newPath
      }
      return { success: true, errMsg: '', fileName, path: filePath, isLocal: false }
    } catch (e) {
      const errMsg = `${uri} 下载失败, ${(e as Error).message}`
      return { success: false, errMsg, fileName: '', path: '', isLocal: false }
    }
  }

  if (type === FileUriType.OneBotBase64) {
    let filename = randomUUID()
    let filePath = path.join(TEMP_DIR, filename)
    const base64 = uri.replace(/^base64:\/\//, '')
    await fsPromise.writeFile(filePath, base64, 'base64')
    if (needExt) {
      const ext = (await ctx.ntFileApi.getFileType(filePath)).ext
      filename += `.${ext}`
      await fsPromise.rename(filePath, `${filePath}.${ext}`)
      filePath = `${filePath}.${ext}`
    }
    return { success: true, errMsg: '', fileName: filename, path: filePath, isLocal: false }
  }

  if (type === FileUriType.DataURL) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
    const capture = /^data:([\w/.+-]+);base64,(.*)$/.exec(uri)
    if (capture) {
      let filename = randomUUID()
      const [, _type, base64] = capture
      let filePath = path.join(TEMP_DIR, filename)
      await fsPromise.writeFile(filePath, base64, 'base64')
      if (needExt) {
        const ext = (await ctx.ntFileApi.getFileType(filePath)).ext
        filename += `.${ext}`
        await fsPromise.rename(filePath, `${filePath}.${ext}`)
        filePath = `${filePath}.${ext}`
      }
      return { success: true, errMsg: '', fileName: filename, path: filePath, isLocal: false }
    }
  }

  if (type === FileUriType.Unknown) {
    // uri可能是文件名
    let fileCache = await ctx.store.getFileCacheById(uri)
    if (!fileCache?.length) {
      fileCache = await ctx.store.getFileCacheByName(uri)
    }
    if (fileCache?.length) {
      const downloadPath = await ctx.ntFileApi.downloadMedia(
        fileCache[0].msgId,
        fileCache[0].chatType,
        fileCache[0].peerUid,
        fileCache[0].elementId,
        '',
        '',
      )
      return { success: true, errMsg: '', fileName: fileCache[0].fileName, path: downloadPath, isLocal: true }
    }
  }

  return { success: false, errMsg: '未知文件类型或路径不存在', fileName: '', path: '', isLocal: false }
}


export async function getFileType(filePath: string) {
  try {
    const type = await fileType.fileTypeFromFile(filePath)

    if (!type) {
      return {
        mime: 'application/octet-stream',
        ext: path.extname(filePath).slice(0) || '',
      }
    }

    return {
      mime: type.mime,
      ext: type.ext,
    }
  } catch (error) {
    console.error('Error detecting file type:', error)
    return {
      mime: '',
      ext: '',
    }
  }
}

export async function getImageSize(path: string) {
  return await imageSizeFromFile(path)
}

export function getMd5FromBuffer(buf: Buffer) {
  return createHash('md5').update(buf).digest('hex')
}
