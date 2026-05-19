import { calculateSha1StreamBytes } from '../src/common/utils/file'
import { createHash, createReadStream } from 'node:crypto'
import { createReadStream as fsRead } from 'node:fs'
import { resolve } from 'node:path'

const TEST = resolve('.tmp/v15.mp4')

async function main() {
  const ours = await calculateSha1StreamBytes(TEST)
  console.log('Our chunked sha1 count:', ours.length)
  ours.forEach((b, i) => console.log(`  [${i}] ${b.toString('hex')}`))

  // Native sha1 整文件
  const hash = createHash('sha1')
  const stream = fsRead(TEST)
  for await (const chunk of stream) hash.update(chunk)
  const nativeSha1 = hash.digest('hex')
  console.log('Native full sha1:', nativeSha1)
  console.log('Match last chunk?', ours[ours.length - 1].toString('hex') === nativeSha1)
}
main()
