import fs from 'node:fs'
import path from 'node:path'
import JSON5 from 'json5'
import { Dict } from 'cosmokit'
import { AdapterSections, Config as LLBotConfig } from '@/common/types'
import { adapterDefaults, defaultConfig } from './defaultConfig'

// Next to the bundle (dist/) or to this file in dev; docker/nix sed it before the first start
const TEMPLATE_FILE = path.join(import.meta.dirname, 'default_config.json')

/** Top-level keys no version reads any more: dropped from the settings file and from incoming old-shape configs. */
export const DEPRECATED_KEYS = ['onlyLocalhost', 'autoDeleteFile', 'autoDeleteFileSecond', 'cardMsgSignUrl']

/** The sections of the old config file that now live in the adapters' plugin entries. */
export const ADAPTER_KEYS = ['ob11', 'satori', 'milky'] as const satisfies readonly (keyof AdapterSections)[]

/** The plugin entry each of those sections lives in. */
export const ADAPTER_ENTRIES: Record<keyof AdapterSections, string> = {
  ob11: 'builtin:onebot11',
  satori: 'builtin:satori',
  milky: 'builtin:milky',
}

function readTemplate(onError?: (error: unknown) => void): Dict {
  const template: Dict = { ...defaultConfig, ...adapterDefaults }
  try {
    Object.assign(template, JSON5.parse(fs.readFileSync(TEMPLATE_FILE, 'utf-8')))
  } catch (e) {
    onError?.(e)
  }
  return template
}

/** The settings a new instance starts from: the code defaults overlaid with default_config.json. */
export function templateConfig(onError?: (error: unknown) => void): LLBotConfig {
  const template = readTemplate(onError)
  for (const key of ADAPTER_KEYS) delete template[key]
  return template as LLBotConfig
}

/** An adapter's section of default_config.json, what its plugin entry starts with. */
export function templateSection<K extends keyof AdapterSections>(key: K): AdapterSections[K] {
  return structuredClone(readTemplate()[key] ?? adapterDefaults[key])
}

/** Brings settings written by an older version to the current shape. */
export function upgradeConfig(oldConfig: Dict): LLBotConfig {
  let migratedConfig = oldConfig
  if ('musicSignUrl' in oldConfig) {
    oldConfig.musicCardSignUrl ??= oldConfig.musicSignUrl
    delete oldConfig.musicSignUrl
  }
  // A music service briefly went by cardMsgSignUrl, a setting since dropped (DEPRECATED_KEYS)
  if (/linyuchen|xingzhige/.test(oldConfig.cardMsgSignUrl ?? '')) {
    oldConfig.musicCardSignUrl ??= oldConfig.cardMsgSignUrl
  }
  if (oldConfig.musicCardSignUrl?.includes('linyuchen')) {
    oldConfig.musicCardSignUrl = defaultConfig.musicCardSignUrl
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
