import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from 'cordis'
import { installPluginResolver, sharedSpecifierMap } from '../../src/plugin/host/resolve-hook.ts'

// Run from an isolated data directory without a usable FFmpeg executable. Never starts QQ.
const scratch = await mkdtemp(path.join(tmpdir(), 'llbot-ffmpeg-media-'))
const previousDirectory = process.cwd()
const previousPath = process.env.PATH
const previousFFmpegPath = process.env.FFMPEG_PATH
const video = fileURLToPath(new URL('../fixtures/ffmpeg/video.mp4', import.meta.url))
const logger = { info() {}, warn() {}, error() {} }
const ctx = { logger } as unknown as Context
const app = new Context()
const pluginDirectory = path.resolve(process.argv[2] || '../LuckyLillia.Plugins/lucky-lillia-plugin-ffmpeg')
const removeResolver = installPluginResolver({ shared: sharedSpecifierMap(), roots: [pathToFileURL(pluginDirectory + path.sep).href] })
const formats = ['mp3', 'amr', 'wma', 'm4a', 'spx', 'ogg', 'wav', 'flac'] as const
try {
  process.chdir(scratch)
  process.env.PATH = ''
  process.env.FFMPEG_PATH = path.join(scratch, 'missing-ffmpeg.exe')
  await mkdir(path.join(scratch, 'data/temp'), { recursive: true })
  const { getFFmpegAddon, installFFmpegBridge } = await import('../../src/common/utils/ffmpeg.ts')
  installFFmpegBridge(app)
  assert.throws(() => getFFmpegAddon(), /lucky-lillia-plugin-ffmpeg/)
  const plugin = await import(pathToFileURL(path.join(pluginDirectory, 'lib/index.js')).href)
  const provider = app.plugin(plugin.default ?? plugin)
  await provider
  await new Promise(resolve => setTimeout(resolve, 0))
  const { encodeSilk, decodeSilk } = await import('../../src/common/utils/audio.ts')
  const { createThumb, getVideoInfo, defaultVideoThumb } = await import('../../src/common/utils/video.ts')
  const { isSilk } = await import('../../src/common/utils/audioFormat.ts')
  const native = getFFmpegAddon()
  assert.equal(typeof native.silkVersion, 'function')
  assert.ok(native.silkVersion!())
  const pcm = Buffer.alloc(48000)
  for (let i = 0; i < 24000; i++) pcm.writeInt16LE(Math.round(Math.sin(i * Math.PI * 880 / 24000) * 8000), i * 2)
  // Precomputed independent codec output checks compatibility without a second runtime codec.
  const referenceFile = fileURLToPath(new URL('../fixtures/ffmpeg/reference.silk', import.meta.url))
  const reference = JSON.parse(await readFile(new URL('../fixtures/ffmpeg/reference-silk-sdk.json', import.meta.url), 'utf8'))
  const referencePcm = await native.decodeAudio(referenceFile, { sampleRate: 24000, channels: 1 })
  assert.equal(createHash('sha256').update(await readFile(referenceFile)).digest('hex'), reference.encodedSha256)
  assert.equal(createHash('sha256').update(referencePcm).digest('hex'), reference.decodedPcmSha256)
  assert.equal(referencePcm.length, reference.decodedPcmBytes)
  assert.equal((await native.probe(referenceFile)).duration, referencePcm.length / 48000)
  const nativeSilk = path.join(scratch, 'SDK参考.silk')
  await native.encodeAudio(pcm, nativeSilk, { format: 'silk', sampleRate: 24000, channels: 1 })
  const nativeSilkBytes = await readFile(nativeSilk)
  assert.equal(nativeSilkBytes[0], 2, 'QQ output must use the Tencent header')
  assert.ok(isSilk(nativeSilkBytes))
  const decodedPcm = await native.decodeAudio(nativeSilk, { sampleRate: 24000, channels: 1 })
  assert.equal(decodedPcm.length, pcm.length)
  let peak = 0
  for (let offset = 0; offset < decodedPcm.length; offset += 2) peak = Math.max(peak, Math.abs(decodedPcm.readInt16LE(offset)))
  assert.ok(peak > 1000, 'Decoder must recover the signal, not silence')
  const input = path.join(scratch, '原生编码.mp3')
  await native.encodeAudio(pcm, input, { format: 'mp3', sampleRate: 24000, channels: 1 })
  const encoded = await encodeSilk(ctx, input)
  assert.equal(encoded.converted, true)
  assert.ok(isSilk(await readFile(encoded.path)))
  assert.ok(encoded.duration > 0.85 && encoded.duration < 1.3)
  const unchanged = await encodeSilk(ctx, encoded.path)
  assert.equal(unchanged.converted, false)
  assert.equal(unchanged.path, encoded.path)
  for (const format of formats) {
    const decoded = await decodeSilk(ctx, encoded.path, format)
    assert.equal(path.extname(decoded), '.' + format)
    const info = await native.probe(decoded)
    assert.ok(info.duration > 0.85 && info.duration < 1.5, format)
    assert.ok((await native.decodeAudio(decoded, { sampleRate: 24000, channels: 1 })).length > 40000, format)
  }
  const wave = await decodeSilk(ctx, encoded.path, 'wav')
  assert.ok(isSilk(await readFile((await encodeSilk(ctx, wave)).path)))
  const info = await getVideoInfo(video)
  assert.equal(info.width, 32)
  assert.equal(info.height, 24)
  const thumb = await readFile(await createThumb(ctx, video))
  assert.deepEqual(thumb.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const invalid = path.join(scratch, '损坏视频.mp4')
  await writeFile(invalid, 'invalid')
  const fallback = await createThumb(ctx, invalid)
  assert.equal(path.extname(fallback), '.jpg')
  assert.deepEqual(await readFile(fallback), defaultVideoThumb)
  await provider.dispose()
  assert.throws(() => getFFmpegAddon(), /lucky-lillia-plugin-ffmpeg/)
  assert.equal((await encodeSilk(ctx, encoded.path)).converted, false)
  await assert.rejects(() => encodeSilk(ctx, wave), /lucky-lillia-plugin-ffmpeg/)
  await assert.rejects(() => decodeSilk(ctx, encoded.path, 'wav'), /lucky-lillia-plugin-ffmpeg/)
  await assert.rejects(() => encodeSilk(ctx, input), /lucky-lillia-plugin-ffmpeg/)
  await assert.rejects(() => decodeSilk(ctx, encoded.path, 'mp3'), /lucky-lillia-plugin-ffmpeg/)
  await assert.rejects(() => getVideoInfo(video), /lucky-lillia-plugin-ffmpeg/)
  assert.deepEqual(await readFile(await createThumb(ctx, video)), defaultVideoThumb)
  await app.plugin(plugin.default ?? plugin)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal((await getVideoInfo(video)).width, 32)
  console.log(JSON.stringify({ passed: true, formats, silkRoundTrip: true, silkInteroperability: true, video: true, fallback: true, noExecutablePath: true, optionalPluginLifecycle: true }))
} finally {
  await app.fiber.dispose()
  removeResolver?.()
  process.chdir(previousDirectory)
  if (previousPath === undefined) delete process.env.PATH
  else process.env.PATH = previousPath
  if (previousFFmpegPath === undefined) delete process.env.FFMPEG_PATH
  else process.env.FFMPEG_PATH = previousFFmpegPath
  assert.ok(path.resolve(scratch).startsWith(path.resolve(tmpdir()) + path.sep + 'llbot-ffmpeg-media-'))
  await rm(scratch, { recursive: true, force: true })
}
