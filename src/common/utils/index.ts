import path from 'node:path'
import fs from 'fs'

export * from './file'
export * from './helper'
export * from './log'
export * from './qqlevel'
export * from './QQBasicInfo'
export * from './upgrade'
export const DATA_DIR = global.LiteLoader.plugins['LLOneBot'].path.data
export const TEMP_DIR = path.join(DATA_DIR, 'temp')
export const PLUGIN_DIR = global.LiteLoader.plugins['LLOneBot'].path.plugin
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}
export { getVideoInfo } from './video'
export { checkFfmpeg } from './video'
export { encodeSilk } from './audio'