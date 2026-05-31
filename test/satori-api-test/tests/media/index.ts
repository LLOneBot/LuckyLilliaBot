/**
 * satori 包共享 onebot11-api-test 的媒体资源（同 milky 的做法）。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname_ = path.dirname(fileURLToPath(import.meta.url))
// satori-api-test/tests/media/ → onebot11-api-test/tests/media/
const ob11MediaDir = path.resolve(__dirname_, '../../../onebot11-api-test/tests/media')

function p(filename: string) {
  return path.join(ob11MediaDir, filename)
}
function fileUri(filename: string) {
  return 'file:///' + p(filename).replace(/\\/g, '/')
}

export const MediaPaths = {
  testAudioUri: fileUri('test.mp3'),
  testImageUri: fileUri('test.gif'),
  testGifUri: fileUri('test.gif'),
  testOcrImageUri: fileUri('test_ocr.png'),
  testMp4Uri: fileUri('test.mp4'),
  resolve: p,
  toUri: fileUri,
}
