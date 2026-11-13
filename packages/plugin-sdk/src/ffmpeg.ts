import type { Buffer } from 'node:buffer'

/** Formats supported by the optional lucky-lillia-plugin-ffmpeg package. */
export type FFmpegAudioFormat = 'mp3' | 'amr' | 'wma' | 'm4a' | 'spx' | 'ogg' | 'wav' | 'flac' | 'silk'

export interface FFmpegMediaInfo {
  width: number
  height: number
  duration: number
  format: string
  size: number
}

/** Optional media service. Declare inject: ['ffmpeg'], or use a local ctx.inject for optional features. */
export interface FFmpegAPI {
  version(): string
  /** Native SILK support (plugin 1.1+). Absent on older plugin versions. */
  silkVersion?(): string
  probe(inputPath: string): Promise<FFmpegMediaInfo>
  /** Decodes to signed 16-bit little-endian PCM; includes QQ/Skype SILK on plugin 1.1+. */
  decodeAudio(inputPath: string, options: { sampleRate: number; channels: number }): Promise<Buffer>
  encodeAudio(pcm: Buffer, outputPath: string, options: {
    sampleRate: number
    channels: number
    format: FFmpegAudioFormat
  }): Promise<void>
  transcodeAudio(inputPath: string, outputPath: string, options: { format: FFmpegAudioFormat }): Promise<void>
  /** Returns a PNG thumbnail. */
  thumbnail(inputPath: string, options?: { maxWidth?: number; maxHeight?: number; time?: number }): Promise<Buffer>
}

declare module 'cordis' {
  interface Context {
    ffmpeg: FFmpegAPI
  }
}
