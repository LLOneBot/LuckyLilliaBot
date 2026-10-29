/**
 * 复制 QFace 中的 emoji 表情到 webui public/face 目录
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// https://github.com/koishijs/QFace
const SOURCE_DIR = path.join(__dirname, '../../../../dist/QFace/public/assets/qq_emoji')
const OUTPUT_DIR = path.join(__dirname, '../public/face')

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

const dirs = fs.readdirSync(SOURCE_DIR).filter(name => !/^\d+$/.test(name))

console.log(`找到 ${dirs.length} 个 emoji 表情文件夹`)

const copied = []
const failed = []

for (const emojiName of dirs) {
  let sourcePath = path.join(SOURCE_DIR, emojiName, 'apng', `${emojiName}.png`)
  if (!fs.existsSync(sourcePath)) {
    sourcePath = path.join(SOURCE_DIR, emojiName, 'png', `${emojiName}.png`)
  }
  
  if (fs.existsSync(sourcePath)) {
    const codePoint = [...emojiName].map(c => c.codePointAt(0).toString(16)).join('-')
    const destPath = path.join(OUTPUT_DIR, `emoji-${codePoint}.png`)
    
    try {
      fs.copyFileSync(sourcePath, destPath)
      console.log(`✓ ${emojiName} -> emoji-${codePoint}.png`)
      copied.push({ emoji: emojiName, codePoint })
    } catch (e) {
      console.log(`✗ ${emojiName}: ${e.message}`)
      failed.push(emojiName)
    }
  } else {
    console.log(`✗ ${emojiName}: png 文件不存在`)
    failed.push(emojiName)
  }
}

console.log(`\n复制完成! 成功: ${copied.length}, 失败: ${failed.length}`)

console.log('\nEmoji 映射表:')
console.log('export const EMOJI_MAP: Record<string, string> = {')
for (const { emoji, codePoint } of copied) {
  console.log(`  '${emoji}': 'emoji-${codePoint}',`)
}
console.log('}')
