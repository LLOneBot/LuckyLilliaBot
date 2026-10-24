import fs from 'node:fs'
import path from 'node:path'
import JSON5 from 'json5'
import { Dict } from 'cosmokit'
import { Config as LLBotConfig } from '@/common/types'
import { defaultConfig } from './defaultConfig'

// Next to the bundle (dist/) or to this file in dev; docker/nix sed it before the first start
const TEMPLATE_FILE = path.join(import.meta.dirname, 'default_config.json')

/** The settings a new instance starts from: the code defaults overlaid with default_config.json. */
export function templateConfig(onError?: (error: unknown) => void): LLBotConfig {
  const config = { ...defaultConfig }
  try {
    Object.assign(config, JSON5.parse(fs.readFileSync(TEMPLATE_FILE, 'utf-8')))
  } catch (e) {
    onError?.(e)
  }
  return config
}

/** Brings settings written by an older version to the current shape. */
export function upgradeConfig(oldConfig: Dict): LLBotConfig {
  let migratedConfig = oldConfig
  if (oldConfig.musicSignUrl && oldConfig.musicSignUrl.includes('linyuchen')) {
    oldConfig.musicSignUrl = defaultConfig.musicSignUrl
  }
  // An ob11 from before `connect` was a list. No ob11 at all is not that: the defaults fill it in
  if (oldConfig.ob11 && !Array.isArray(oldConfig.ob11.connect)) {
    const ob11 = oldConfig.ob11
    migratedConfig = {
      ...oldConfig,
      ob11: {
        enable: ob11.enable || false,
        connect: [
          {
            type: 'ws',
            enable: ob11.enableWs || false,
            port: ob11.wsPort || 3001,
            heartInterval: oldConfig.heartInterval || 30000,
            token: ob11.token || '',
            messageFormat: ob11.messagePostFormat || 'array',
            reportSelfMessage: ob11.reportSelfMessage || false,
            reportOfflineMessage: oldConfig.receiveOfflineMsg || false,
            debug: oldConfig.debug || false,
          },
          {
            type: 'ws-reverse',
            enable: ob11.enableWsReverse || false,
            url: (ob11.wsReverseUrls && ob11.wsReverseUrls[0]) || '',
            heartInterval: oldConfig.heartInterval || 30000,
            token: ob11.token || '',
            messageFormat: ob11.messagePostFormat || 'array',
            reportSelfMessage: ob11.reportSelfMessage || false,
            reportOfflineMessage: oldConfig.receiveOfflineMsg || false,
            debug: oldConfig.debug || false,
          },
          {
            type: 'http',
            enable: ob11.enableHttp || false,
            port: ob11.httpPort || 3000,
            token: ob11.token || '',
            messageFormat: ob11.messagePostFormat || 'array',
            reportSelfMessage: ob11.reportSelfMessage || false,
            reportOfflineMessage: oldConfig.receiveOfflineMsg || false,
            debug: oldConfig.debug || false,
          },
          {
            type: 'http-post',
            enable: ob11.enableHttpPost || false,
            url: (ob11.httpPostUrls && ob11.httpPostUrls[0]) || '',
            enableHeart: ob11.enableHttpHeart || false,
            heartInterval: oldConfig.heartInterval || 30000,
            token: ob11.httpSecret || '',
            messageFormat: ob11.messagePostFormat || 'array',
            reportSelfMessage: ob11.reportSelfMessage || false,
            reportOfflineMessage: oldConfig.receiveOfflineMsg || false,
            debug: oldConfig.debug || false,
          },
        ],
      },
    }
  }

  // 迁移 onlyLocalhost 配置项
  if ('onlyLocalhost' in oldConfig) {
    const host = oldConfig.onlyLocalhost ? '127.0.0.1' : ''

    if (migratedConfig.webui && !migratedConfig.webui.host) {
      migratedConfig.webui.host = host
    }
    if (migratedConfig.satori && !migratedConfig.satori.host) {
      migratedConfig.satori.host = host
    }
    if (migratedConfig.milky?.http && !migratedConfig.milky.http.host) {
      migratedConfig.milky.http.host = host
    }
    if (Array.isArray(migratedConfig.ob11?.connect)) {
      for (const conn of migratedConfig.ob11.connect) {
        if ((conn.type === 'ws' || conn.type === 'http') && !conn.host) {
          conn.host = host
        }
      }
    }
    delete migratedConfig.onlyLocalhost
  }

  return migratedConfig as LLBotConfig
}
