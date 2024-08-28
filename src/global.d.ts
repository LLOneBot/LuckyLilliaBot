import type { LLOneBot } from './preload'
import { Dict } from 'cosmokit'

declare global {
  interface Window {
    llonebot: LLOneBot
    LiteLoader: Dict
  }
  var LiteLoader: Dict
}