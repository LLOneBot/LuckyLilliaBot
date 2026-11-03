import type { Context } from '@luckylillia/plugin-sdk'

/** Downloaded once, for every check */
export interface Image {
  data: ArrayBuffer
  type: string
}

const MAX_SIZE = 20 * 1024 * 1024

export async function download(ctx: Context, url: string): Promise<Image> {
  // Direct: the bot reaches QQ's image servers without a proxy, and one abroad would only slow them down
  const file = await ctx.http.file(url, { timeout: 30_000, proxyAgent: '' })
  if (file.data.byteLength > MAX_SIZE) throw new Error('the image is over 20 MB')
  // file() reads the type from the bytes when QQ says application/octet-stream; past what it knows, PNG is a guess
  return { data: file.data, type: file.type.startsWith('image/') ? file.type : 'image/png' }
}
