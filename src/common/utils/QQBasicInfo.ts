import path from 'node:path'
import os from 'node:os'
import { systemPlatform } from './system'

export const exePath = process.execPath

function getPKGPath() {
  let p = path.join(path.dirname(exePath), 'resources', 'app', 'package.json')
  if (systemPlatform === 'darwin') {
    p = path.join(path.dirname(path.dirname(exePath)), 'Resources', 'app', 'package.json')
  }
  return p
}

export const pkgInfoPath = getPKGPath()
let configVersionInfoPath: string


if (os.platform() !== 'linux') {
  configVersionInfoPath = path.join(path.dirname(exePath), 'resources', 'app', 'versions', 'config.json')
}
else {
  const userPath = os.homedir()
  const appDataPath = path.resolve(userPath, './.config/QQ')
  configVersionInfoPath = path.resolve(appDataPath, './versions/config.json')
}

if (typeof configVersionInfoPath !== 'string') {
  throw new Error('Something went wrong when load QQ info path')
}

export { configVersionInfoPath }

type QQPkgInfo = {
  version: string
  buildVersion: string
  platform: string
  eleArch: string
}

export const qqPkgInfo: QQPkgInfo = require(pkgInfoPath)
// platform_type: 3,
// app_type: 4,
// app_version: '9.9.9-23159',
// qua: 'V1_WIN_NQ_9.9.9_23159_GW_B',
// appid: '537213764',
// platVer: '10.0.26100',
// clientVer: '9.9.9-23159',

export function getBuildVersion(): number {
  return +qqPkgInfo.buildVersion
}