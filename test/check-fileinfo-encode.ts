import { Media } from '../src/ntqqapi/proto'

// FileInfo only set fileType.type = 2
const buf = Media.FileInfo.encode({
  fileSize: 100,
  md5HexStr: 'aa',
  sha1HexStr: 'bb',
  fileName: 'test.mp4',
  fileType: { type: 2 } as any,
} as any)
console.log('hex:', Buffer.from(buf).toString('hex'))
console.log('len:', buf.length)

// Decode 看 fileType 各字段
const decoded = Media.FileInfo.decode(Buffer.from(buf))
console.log('decoded fileType:', decoded.fileType)

// 对照：传完整 fileType
const buf2 = Media.FileInfo.encode({
  fileSize: 100,
  md5HexStr: 'aa',
  sha1HexStr: 'bb',
  fileName: 'test.mp4',
  fileType: { type: 2, picFormat: 0, videoFormat: 0, pttFormat: 0 },
} as any)
console.log('full hex:', Buffer.from(buf2).toString('hex'))
console.log('full len:', buf2.length)
