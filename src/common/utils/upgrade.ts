import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { version } from '../../version'
import { log, fetchFile } from '.'
import { TEMP_DIR } from '../globalVars'

const downloadMirrorHosts = ['https://ghp.ci/']
const releasesMirrorHosts = ['https://kkgithub.com']

export async function checkNewVersion() {
  const latestVersionText = await getRemoteVersion()
  const latestVersion = latestVersionText.split('.')
  log('LLOneBot latest version', latestVersion)
  const currentVersion = version.split('.')
  //log('llonebot current version', currentVersion)
  for (const k of [0, 1, 2]) {
    const latest = parseInt(latestVersion[k])
    const current = parseInt(currentVersion[k])
    if (latest > current) {
      log('')
      return { result: true, version: latestVersionText }
    } else if (latest < current) {
      break
    }
  }
  return { result: false, version: version }
}

export async function upgradeLLOneBot(): Promise<boolean> {
  const latestVersion = await getRemoteVersion()
  if (latestVersion && latestVersion != '') {
    const downloadUrl = `https://github.com/LLOneBot/LLOneBot/releases/download/v${latestVersion}/LLOneBot.zip`
    const filePath = path.join(TEMP_DIR, './update-' + latestVersion + '.zip')
    // 多镜像下载
    for (const mirrorGithub of downloadMirrorHosts) {
      try {
        const res = await fetchFile(mirrorGithub + downloadUrl)
        await writeFile(filePath, res.data)
        return globalThis.LiteLoader.api.plugin.install(filePath)
      } catch (e) {
        log('llonebot upgrade error', e)
      }
    }
  }
  return false
}

export async function getRemoteVersion() {
  for (const mirror of releasesMirrorHosts) {
    const version = await getRemoteVersionByReleasesMirror(mirror)
    if (version) {
      return version
    }
  }
  for (const mirror of downloadMirrorHosts) {
    const version = await getRemoteVersionByDownloadMirror(mirror)
    if (version) {
      return version
    }
  }
  return ''
}

export async function getRemoteVersionByDownloadMirror(mirrorGithub: string) {
  try {
    const source = 'https://raw.githubusercontent.com/LLOneBot/LLOneBot/main/src/version.ts'
    const page = (await fetchFile(mirrorGithub + source)).data.toString()
    return page.match(/(\d+\.\d+\.\d+)/)?.[0]
  } catch (e) {
    log(e?.toString())
  }
}

export async function getRemoteVersionByReleasesMirror(mirrorGithub: string) {
  try {
    const page = (await fetchFile(mirrorGithub + '/LLOneBot/LLOneBot/releases')).data.toString()
    return page.match(new RegExp('(?<=(tag/v)).*?(?=("))'))?.[0]
  } catch { }
}
