import path from 'node:path'
import compressing from 'compressing'
import { writeFile } from 'node:fs/promises'
import { version } from '../../version'
import { copyFolder, log, fetchFile } from '.'
import { PLUGIN_DIR, TEMP_DIR } from '../globalVars'

const downloadMirrorHosts = ['https://ghp.ci/']

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

export async function upgradeLLOneBot() {
  const latestVersion = await getRemoteVersion()
  if (latestVersion && latestVersion != '') {
    const downloadUrl = `https://github.com/LLOneBot/LLOneBot/releases/download/v${latestVersion}/LLOneBot.zip`
    const filePath = path.join(TEMP_DIR, './update-' + latestVersion + '.zip')
    let downloadSuccess = false
    // 多镜像下载
    for (const mirrorGithub of downloadMirrorHosts) {
      try {
        const res = await fetchFile(mirrorGithub + downloadUrl)
        await writeFile(filePath, res.data)
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
    const uncompressedPromise = async function () {
      return new Promise<boolean>(resolve => {
        compressing.zip
          .uncompress(filePath, temp_ver_dir)
          .then(() => {
            resolve(true)
          })
          .catch(reason => {
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
  let version = ''
  const mirrorGithub = downloadMirrorHosts[0]
  const tVersion = await getRemoteVersionByMirror(mirrorGithub)
  if (tVersion) {
    version = tVersion
  }
  return version
}

export async function getRemoteVersionByMirror(mirrorGithub: string) {
  try {
    const source = 'https://raw.githubusercontent.com/LLOneBot/LLOneBot/main/src/version.ts'
    const page = (await fetchFile(mirrorGithub + source)).data.toString()
    return page.match(/(\d+\.\d+\.\d+)/)?.[0]
  } catch (e) {
    log(e?.toString())
  }
}
