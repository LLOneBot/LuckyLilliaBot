import { AdapterSections, Config, MilkyConfig, OB11Config, SatoriConfig, WebUIConfig } from '@/common/types'

const ob11Default: OB11Config = {
  enable: true,
  connect: [
  ]
}
const satoriDefault: SatoriConfig = {
  enable: false,
  host: '127.0.0.1',
  port: 5600,
  token: '',
}
const milkyDefault: MilkyConfig = {
  enable: false,
  reportSelfMessage: false,
  http: {
    host: '127.0.0.1',
    port: 3010,
    prefix: '',
    accessToken: ''
  },
  webhook: {
    urls: [],
    accessToken: ''
  }
}
const webuiDefault: WebUIConfig = {
  enable: true,
  host: '127.0.0.1',
  port: 3080,
}
/** The adapters' defaults; default_config.json's sections override them for a new entry. */
export const adapterDefaults: AdapterSections = {
  ob11: ob11Default,
  satori: satoriDefault,
  milky: milkyDefault,
}

export const defaultConfig: Config = {
  webui: webuiDefault,
  enableLocalFile2Url: false,
  log: true,
  cardMsgSignUrl: 'https://ss.xingzhige.com/music_card/card',
  msgCacheExpire: 120,
  ffmpeg: '',
  // default_config.json 也有这一项; 两份默认值必须一致 (见 test/unit/config/defaults.test.ts)
  logLevel: 'info',
}
