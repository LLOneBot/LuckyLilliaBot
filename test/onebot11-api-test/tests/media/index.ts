import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

// 兼容 CommonJS 和 ESM
const getMediaDir = (): string => {
  try {
    // eval 避开 TypeScript 对 import.meta 的编译期检查
    const importMetaUrl = eval('import.meta.url');
    if (importMetaUrl) {
      const __filename = fileURLToPath(importMetaUrl);
      return path.dirname(__filename);
    }
  } catch (e) {
    // ESM 不可用，尝试 CommonJS
  }

  try {
    const dirname = eval('__dirname');
    if (dirname) {
      return dirname;
    }
  } catch (e) {
    // CommonJS 也不可用
  }

  return path.join(process.cwd(), 'tests', 'media');
};

const mediaDir = getMediaDir();

function getMediaPath(filename: string): string {
  return path.join(mediaDir, filename);
}

function getMediaFileUrl(filename: string): string {
  const absolutePath = getMediaPath(filename);
  return `file:///${absolutePath.replace(/\\/g, '/')}`;
}

/** 每个进程用 ffmpeg 现生成一个视频 (进程内复用), 避开 server 对固定 hash 的异常状态: test.mp4 发多了就不再广播 */
const generatedDir = path.join(mediaDir, 'generated');
let cachedFreshVideoPath: string | null = null;

function generateFreshVideo(): string {
  if (cachedFreshVideoPath && existsSync(cachedFreshVideoPath)) {
    return cachedFreshVideoPath;
  }
  if (!existsSync(generatedDir)) {
    mkdirSync(generatedDir, { recursive: true });
  }
  const ts = `${Date.now()}${process.hrtime.bigint()}`;
  const out = path.join(generatedDir, `big-${ts}.mp4`);
  // 噪点 + 时间戳水印保证每个进程的视频都不同; 进程内第二次发会走秒传, 两条路径都测到。
  // drawtext 必须显式带 fontfile: gyan.dev 的 Windows ffmpeg 没装 fontconfig 会报
  // "Cannot load default config file", 装了 fontsize >= 80 也会 segfault
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
  ].join(' ');
  execSync(cmd, { stdio: 'inherit' });
  cachedFreshVideoPath = out;
  return out;
}

function getFreshVideoUrl(): string {
  return `file:///${generateFreshVideo().replace(/\\/g, '/')}`;
}

export const MediaPaths = {
  testAudio: getMediaPath('test.mp3'),
  testAudioUrl: getMediaFileUrl('test.mp3'),
  testAudio2Url: getMediaFileUrl('test2.mp3'),
  testGifUrl: getMediaFileUrl('test.gif'),
  testImageUrl: getMediaFileUrl('test.gif'),
  testOcrImageUrl: getMediaFileUrl('test_ocr.png'),
  get testVideoUrl() { return getFreshVideoUrl(); },
  get testVideoPath() { return generateFreshVideo(); },
  getPath: getMediaPath,
  getFileUrl: getMediaFileUrl,
};

