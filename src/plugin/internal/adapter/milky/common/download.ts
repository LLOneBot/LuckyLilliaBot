import fsp from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

async function getResponse(
  url: string,
  headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0 Win64 x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36',
  },
  useReferer: boolean = false,
): Promise<Response> {
  if (useReferer && !headers['Referer']) {
    headers['Referer'] = url
  }
  return await fetch(url, { headers })
}

export async function download(url: string, headers?: Record<string, string>) {
  let resp = await getResponse(url, headers, false)
  if (resp.status === 403 && !headers) {
    resp = await getResponse(url, headers, true)
  }
  if (!resp.ok) {
    throw new Error(`Failed to download file from ${url}: ${resp.status} ${resp.statusText}`)
  }
  const bytes = await resp.blob().then((b) => b.arrayBuffer())
  return Buffer.from(bytes)
}

export async function resolveMilkyUri(uri: string): Promise<Buffer> {
  if (uri.startsWith('file://')) {
    return await fsp.readFile(fileURLToPath(uri))
  }
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return await download(uri)
  }
  if (uri.startsWith('base64://')) {
    return Buffer.from(uri.slice(9), 'base64')
  }
  throw new Error(`Unsupported URI scheme: ${uri}`)
}
