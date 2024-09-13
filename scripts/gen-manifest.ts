import { version } from '../src/version'
import { writeFileSync } from 'node:fs'

const manifest = {
  manifest_version: 4,
  type: 'extension',
  name: 'LLOneBot',
  slug: 'LLOneBot',
  description: '实现 OneBot 11 协议，用于 QQ 机器人开发',
  version,
  icon: './icon.webp',
  authors: [
    {
      name: 'linyuchen',
      link: 'https://github.com/linyuchen'
    }
  ],
  repository: {
    repo: 'LLOneBot/LLOneBot',
    branch: 'main',
    release: {
      tag: 'latest',
      name: 'LLOneBot.zip'
    }
  },
  platform: [
    'win32',
    'linux',
    'darwin'
  ],
  injects: {
    renderer: './renderer/index.js',
    main: './main/main.cjs',
    preload: './preload/preload.cjs'
  }
}

writeFileSync('manifest.json', JSON.stringify(manifest, null, 2))
