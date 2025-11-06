import { Config, OB11Config, SatoriConfig, WebUIConfig } from '@/common/types'

const ob11Default: OB11Config = {
  enable: true,
  connect: [
  ]
}
const satoriDefault: SatoriConfig = {
  enable: false,
  port: 5600,
  token: '',
}
const webuiDefault: WebUIConfig = {
  enable: true,
  port: 3080,
}
export const defaultConfig: Config = {
  webui: webuiDefault,
  onlyLocalhost: true,
  satori: satoriDefault,
  ob11: ob11Default,
  enableLocalFile2Url: false,
  log: true,
  autoDeleteFile: false,
  autoDeleteFileSecond: 60,
  musicSignUrl: 'https://llob.linyuchen.net/sign/music',
  msgCacheExpire: 120,
  ffmpeg: '',
  rawMsgPB: false,
}
