import { version } from '../../version'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { copyFolder, httpDownload, log, PLUGIN_DIR, TEMP_DIR } from '.'
import compressing from 'compressing'

const downloadMirrorHosts = ['https://mirror.ghproxy.com/']
const checkVersionMirrorHosts = ['https://521github.com']

export async function checkNewVersion() {
  const latestVersionText = await getRemoteVersion()
  const latestVersion = latestVersionText.split('.')
  log('llonebot last version', latestVersion)
  const currentVersion: string[] = version.split('.')
  log('llonebot current version', currentVersion)
  for (let k of [0, 1, 2]) {
    if (parseInt(latestVersion[k]) > parseInt(currentVersion[k])) {
      log('')
      return { result: true, version: latestVersionText }
    } else if (parseInt(latestVersion[k]) < parseInt(currentVersion[k])) {
      break
    }
  }
  return { result: false, version: version }
}

export async function upgradeLLOneBot() {
  const latestVersion = await getRemoteVersion()
  if (latestVersion && latestVersion != '') {
    const downloadUrl = 'https://github.com/LLOneBot/LLOneBot/releases/download/v' + latestVersion + '/LLOneBot.zip'
    const filePath = path.join(TEMP_DIR, './update-' + latestVersion + '.zip')
    let downloadSuccess = false
    // 多镜像下载
    for (const mirrorGithub of downloadMirrorHosts) {
      try {
        const buffer = await httpDownload(mirrorGithub + downloadUrl)
        fs.writeFileSync(filePath, buffer)
        downloadSuccess = true
        break
      } catch (e) {
        log('llonebot upgrade error', e)
      }
    }
    if (!downloadSuccess) {
      log('llonebot upgrade error', 'download failed')
      return false
    }
    const temp_ver_dir = path.join(TEMP_DIR, 'LLOneBot' + latestVersion)
    let uncompressedPromise = async function () {
      return new Promise<boolean>((resolve, reject) => {
        compressing.zip
          .uncompress(filePath, temp_ver_dir)
          .then(() => {
            resolve(true)
          })
          .catch((reason: any) => {
            log('llonebot upgrade failed, ', reason)
            if (reason?.errno == -4082) {
              resolve(true)
            }
            resolve(false)
          })
      })
    }
    const uncompressedResult = await uncompressedPromise()
    // 复制文件
    await copyFolder(temp_ver_dir, PLUGIN_DIR)

    return uncompressedResult
  }
  return false
}

export async function getRemoteVersion() {
  let Version = ''
  for (let i = 0; i < checkVersionMirrorHosts.length; i++) {
    let mirrorGithub = checkVersionMirrorHosts[i]
    let tVersion = await getRemoteVersionByMirror(mirrorGithub)
    if (tVersion && tVersion != '') {
      Version = tVersion
      break
    }
  }
  return Version
}

export async function getRemoteVersionByMirror(mirrorGithub: string) {
  let releasePage = 'error'

  try {
    releasePage = (await httpDownload(mirrorGithub + '/LLOneBot/LLOneBot/releases')).toString()
    // log("releasePage", releasePage);
    if (releasePage === 'error') return ''
    return releasePage.match(new RegExp('(?<=(tag/v)).*?(?=("))'))[0]
  } catch {}
  return ''
}
