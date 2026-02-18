import ffmpeg from 'fluent-ffmpeg'
import path from 'node:path'
import fs from 'node:fs'

export function setFFMpegPath(ffmpegPath: string) {
  // const platform = os.platform()
  // const executableName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

  // const pathEnv = process.env.PATH || ''
  // const pathDirs = pathEnv.split(path.delimiter)
  // const envPaths = pathDirs.map(dir => path.join(dir, executableName))

  const paths: string[] = [
    ffmpegPath,
    path.join(import.meta.dirname, 'ffmpeg.exe'),
    process.env['FFMPEG_PATH'] || '',
    // ...envPaths,
  ]
  // try {
  //   const cmd = platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg'
  //   const result = execSync(cmd).toString().trim()
  //   if (result && fs.existsSync(result)) {
  //     paths.push(result.trim())
  //   }
  // } catch (e) {
  // }
  for (const p of paths) {
    if (fs.existsSync(p)) {
      ffmpeg.setFfmpegPath(p)
      console.log('set ffmpeg successfully', p)
      break
    }
  }
}
