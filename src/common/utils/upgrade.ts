import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { version } from '../../version'
import { log, fetchFile } from '.'
import { TEMP_DIR } from '../globalVars'
import { compare } from 'compare-versions'

const downloadMirrors = ['https://ghgo.xyz/']
const releasesMirrors = ['https://kkgithub.com/']

export async function checkNewVersion() {
  const latestVersion = await getRemoteVersion()
  log('LLOneBot latest version', latestVersion)
  if (latestVersion === '') {
    return { result: false, version: latestVersion }
  }
  if (compare(latestVersion, version, '>')) {
    return { result: true, version: latestVersion }
  }
  return { result: false, version: version }
}

export async function upgradeLLOneBot(): Promise<boolean> {
  const latestVersion = await getRemoteVersion()
  if (latestVersion && latestVersion != '') {
    const downloadUrl = `https://github.com/LLOneBot/LLOneBot/releases/download/v${latestVersion}/LLOneBot.zip`
    const filePath = path.join(TEMP_DIR, './update-' + latestVersion + '.zip')
    // 多镜像下载
    for (const mirrorGithub of downloadMirrors) {
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
  for (const mirror of releasesMirrors) {
    const version = await getRemoteVersionByReleasesMirror(mirror)
    if (version) {
      return version
    }
  }
  for (const mirror of downloadMirrors) {
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
    const page = (await fetchFile(mirrorGithub + 'LLOneBot/LLOneBot/releases')).data.toString()
    return page.match(new RegExp('(?<=(tag/v)).*?(?=("))'))?.[0]
  } catch { }
}
