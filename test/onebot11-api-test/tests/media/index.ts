/**
 * 测试媒体文件路径管理
 * 集中管理所有测试用的媒体文件路径
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

// 获取 media 目录的绝对路径 (兼容 CommonJS 和 ESM)
const getMediaDir = (): string => {
  try {
    // ESM 模式 - 使用 eval 避免 TypeScript 编译时检查
    const importMetaUrl = eval('import.meta.url');
    if (importMetaUrl) {
      const __filename = fileURLToPath(importMetaUrl);
      return path.dirname(__filename);
    }
  } catch (e) {
    // ESM 不可用，尝试 CommonJS
  }

  try {
    // CommonJS 模式
    const dirname = eval('__dirname');
    if (dirname) {
      return dirname;
    }
  } catch (e) {
    // CommonJS 也不可用
  }

  // Fallback: 使用当前工作目录
  return path.join(process.cwd(), 'tests', 'media');
};

const mediaDir = getMediaDir();

/**
 * 获取媒体文件的绝对路径
 * @param filename 文件名
 * @returns 绝对路径
 */
function getMediaPath(filename: string): string {
  return path.join(mediaDir, filename);
}

/**
 * 获取媒体文件的 file:// URL
 * @param filename 文件名
 * @returns file:// 格式的 URL
 */
function getMediaFileUrl(filename: string): string {
  const absolutePath = getMediaPath(filename);
  return `file:///${absolutePath.replace(/\\/g, '/')}`;
}

/**
 * 用 ffmpeg 生成一段唯一的测试视频，避免命中服务端的视频缓存（test.mp4 重复发送
 * 多次后会触发服务端某种异常状态，导致 broadcast 不下发）。
 * 文件路径形如 generated/big-<ts>.mp4，存放在 tests/media/generated 下。
 * 同一进程多次调用复用同一文件（lazy-init）。
 */
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
  // 1280x720@30fps 5 秒视频；噪点+时间戳水印保证视频唯一（每个进程一个）
  // 同一进程内两次发送会触发服务端秒传（fresh + 秒传 一并测）
  const cmd = [
    'ffmpeg', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `"color=c=black:s=1280x720:r=30:d=5,format=yuv420p,noise=alls=80:allf=t+u,drawtext=text='UID-${ts}':fontcolor=white:fontsize=80:x=20:y=20"`,
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

// 导出常用的媒体文件路径
export const MediaPaths = {
  // 音频文件
  testAudio: getMediaPath('test.mp3'),
  testAudioUrl: getMediaFileUrl('test.mp3'),
  testAudio2Url: getMediaFileUrl('test2.mp3'),
  testGifUrl: getMediaFileUrl('test.gif'),
  testImageUrl: getMediaFileUrl('test.gif'),
  // 视频用 ffmpeg 现生成（同一进程复用一个文件），避免服务端针对固定 md5 的异常缓存状态
  get testVideoUrl() { return getFreshVideoUrl(); },
  get testVideoPath() { return generateFreshVideo(); },
  // 工具函数
  getPath: getMediaPath,
  getFileUrl: getMediaFileUrl,
};

