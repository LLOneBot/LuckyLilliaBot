/**
 * 测试媒体文件路径管理
 * 集中管理所有测试用的媒体文件路径
 */

import path from 'path';
import { fileURLToPath } from 'url';

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

// 导出常用的媒体文件路径
export const MediaPaths = {
  // 音频文件
  testAudio: getMediaPath('test.mp3'),
  testAudioUrl: getMediaFileUrl('test.mp3'),
  testAudio2Url: getMediaFileUrl('test2.mp3'),
  testGifUrl: getMediaFileUrl('test.gif'),
  testVideoUrl: getMediaFileUrl('test.mp4'),
  // 工具函数
  getPath: getMediaPath,
  getFileUrl: getMediaFileUrl,
};
