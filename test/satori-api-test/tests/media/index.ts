/**
 * satori 包共享 onebot11-api-test 的媒体资源（同 milky 的做法）。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

const __dirname_ = path.dirname(fileURLToPath(import.meta.url))
// satori-api-test/tests/media/ → onebot11-api-test/tests/media/
const ob11MediaDir = path.resolve(__dirname_, '../../../onebot11-api-test/tests/media')

function p(filename: string) {
  return path.join(ob11MediaDir, filename)
}
function fileUri(filename: string) {
  return 'file:///' + p(filename).replace(/\\/g, '/')
}

const generatedDir = path.join(ob11MediaDir, 'generated')
function generateFreshVideo(): string {
  if (!existsSync(generatedDir)) mkdirSync(generatedDir, { recursive: true })
  const ts = `${Date.now()}${process.hrtime.bigint()}`
  const out = path.join(generatedDir, `satori-${ts}.mp4`)
  // 跟 milky 测试保持同样的 fontfile 配置（gyan portable ffmpeg drawtext 需要显式 fontfile）
  const fontfile = process.platform === 'win32'
    ? `'C\\:/Windows/Fonts/arial.ttf'`
    : `'/System/Library/Fonts/Helvetica.ttc'`
  const cmd = [
    'ffmpeg', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `"color=c=black:s=1280x720:r=30:d=5,format=yuv420p,noise=alls=80:allf=t+u,drawtext=fontfile=${fontfile}:text='UID-${ts}':fontcolor=white:fontsize=80:x=20:y=20"`,
    '-f', 'lavfi', '-i', '"anullsrc=channel_layout=stereo:sample_rate=44100"',
    '-shortest', '-c:v', 'libx264', '-b:v', '2500k', '-maxrate', '3000k', '-bufsize', '6000k',
    '-c:a', 'aac', '-b:a', '128k', '-f', 'mp4',
    `"${out}"`, '-y',
  ].join(' ')
  execSync(cmd, { stdio: 'inherit' })
  return out
}

export const MediaPaths = {
  testAudioUri: fileUri('test.mp3'),
  testImageUri: fileUri('test.gif'),
  testGifUri: fileUri('test.gif'),
  testOcrImageUri: fileUri('test_ocr.png'),
  testMp4Uri: fileUri('test.mp4'),
  /** 现场 ffmpeg 生成的全新视频（每次调用一个新的, hash 必不同），用于"全新视频"场景测试 */
  newFreshVideoPath: () => generateFreshVideo(),
  newFreshVideoUri: () => 'file:///' + generateFreshVideo().replace(/\\/g, '/'),
  resolve: p,
  toUri: fileUri,
}
