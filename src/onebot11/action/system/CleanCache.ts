import { BaseAction } from '../BaseAction'
import { ActionName } from '../types'
import fs from 'node:fs'
import Path from 'node:path'
import { ChatCacheListItemBasic, CacheFileType } from '@/ntqqapi/types'

export default class CleanCache extends BaseAction<void, void> {
  actionName = ActionName.CleanCache

  protected async _handle(): Promise<void> {
    const cacheFilePaths: string[] = []

    await this.ctx.ntFileCacheApi.setCacheSilentScan(false)

    cacheFilePaths.push(await this.ctx.ntFileCacheApi.getHotUpdateCachePath())
    cacheFilePaths.push(await this.ctx.ntFileCacheApi.getDesktopTmpPath())

    const list = await this.ctx.ntFileCacheApi.getCacheSessionPathList()
    list.forEach((e) => cacheFilePaths.push(e.value))

    // await NTQQApi.addCacheScannedPaths(); // XXX: 调用就崩溃，原因目前还未知
    const cacheScanResult = await this.ctx.ntFileCacheApi.scanCache()
    const cacheSize = parseInt(cacheScanResult.size[6])

    if (cacheScanResult.result !== 0) {
      throw 'Something went wrong while scanning cache. Code: ' + cacheScanResult.result
    }

    await this.ctx.ntFileCacheApi.setCacheSilentScan(true)
    if (cacheSize > 0 && cacheFilePaths.length > 2) {
      // 存在缓存文件且大小不为 0 时执行清理动作
      // await NTQQApi.clearCache([ 'tmp', 'hotUpdate', ...cacheScanResult ]) // XXX: 也是调用就崩溃，调用 fs 删除得了
      deleteCachePath(cacheFilePaths)
    }

    // 获取聊天记录列表
    // NOTE: 以防有人不需要删除聊天记录，暂时先注释掉，日后加个开关
    // const privateChatCache = await getCacheList(ChatType.friend); // 私聊消息
    // const groupChatCache = await getCacheList(ChatType.group); // 群聊消息
    // const chatCacheList = [ ...privateChatCache, ...groupChatCache ];
    const chatCacheList: ChatCacheListItemBasic[] = []

    // 获取聊天缓存文件列表
    const cacheFileList: string[] = []

    for (const name in CacheFileType) {
      if (!isNaN(parseInt(name))) continue

      const fileType = CacheFileType[name] as unknown as CacheFileType

      cacheFileList.push(...(await this.ctx.ntFileCacheApi.getFileCacheInfo(fileType)).infos.map((file) => file.fileKey))
    }

    // 一并清除
    await this.ctx.ntFileCacheApi.clearChatCache(chatCacheList, cacheFileList)
  }
}

function deleteCachePath(pathList: string[]) {
  const emptyPath = (path: string) => {
    if (!fs.existsSync(path)) return
    const files = fs.readdirSync(path)
    files.forEach((file) => {
      const filePath = Path.resolve(path, file)
      const stats = fs.statSync(filePath)
      if (stats.isDirectory()) emptyPath(filePath)
      else fs.unlinkSync(filePath)
    })
    fs.rmdirSync(path)
  }

  for (const path of pathList) {
    emptyPath(path)
  }
}
