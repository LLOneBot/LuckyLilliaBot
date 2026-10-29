import { Context } from 'cordis'
import { Hono } from 'hono'

/** 上传分两步: FE 先经 POST /upload-file (upload.ts) 拿到 filePath, 再调 /group-file/upload 传到群里 */
export function createGroupFilesRoutes(ctx: Context): Hono {
  const router = new Hono()

  router.get('/group-files', async (c) => {
    try {
      const { groupCode, folderId } = c.req.query() as { groupCode: string; folderId?: string }
      if (!groupCode) {
        return c.json({ success: false, message: '缺少 groupCode 参数' }, 400)
      }
      const dir = folderId || '/'
      const items = []
      let nextIndex: number | undefined
      while (nextIndex !== 0) {
        const res = await ctx.ntGroupApi.getGroupFileList(+groupCode, dir, nextIndex ?? 0, 100)
        if (res.retCode !== 0) {
          return c.json({ success: false, message: res.clientWording || '获取群文件列表失败' }, 500)
        }
        items.push(...res.items)
        nextIndex = res.nextIndex
      }

      const files = items.filter(i => i.fileInfo).map(i => {
        const f = i.fileInfo!
        return {
          fileId: f.fileId,
          fileName: f.fileName,
          fileSize: Number(f.fileSize),
          busId: f.busId,
          uploadTime: f.uploadedTime,
          deadTime: f.expireTime,
          modifyTime: f.modifiedTime,
          downloadTimes: f.downloadedTimes,
          uploaderUin: String(f.uploaderUin),
          uploaderName: f.uploaderName,
        }
      })
      const folders = items.filter(i => i.folderInfo).map(i => {
        const d = i.folderInfo!
        return {
          folderId: d.folderId,
          folderName: d.folderName,
          createTime: d.createTime,
          creatorUin: String(d.createUin),
          creatorName: d.creatorName,
          fileCount: d.totalFileCount,
          modifyTime: d.modifyTime,
        }
      })
      return c.json({ success: true, data: { files, folders } })
    } catch (e) {
      ctx.logger.error('获取群文件列表失败:', e)
      return c.json({ success: false, message: '获取群文件列表失败', error: (e as Error).message }, 500)
    }
  })

  router.get('/group-file-space', async (c) => {
    try {
      const { groupCode } = c.req.query() as { groupCode: string }
      if (!groupCode) {
        return c.json({ success: false, message: '缺少 groupCode 参数' }, 400)
      }
      const [count, space] = await Promise.all([
        ctx.ntGroupApi.getGroupFileCount(+groupCode),
        ctx.ntGroupApi.getGroupFileSpace(+groupCode),
      ])
      return c.json({
        success: true,
        data: {
          fileCount: count.fileCount,
          limitCount: count.limitCount,
          usedSpace: space.usedSpace,
          totalSpace: space.totalSpace,
        },
      })
    } catch (e) {
      ctx.logger.error('获取群文件空间失败:', e)
      return c.json({ success: false, message: '获取群文件空间失败', error: (e as Error).message }, 500)
    }
  })

  router.get('/group-file-url', async (c) => {
    try {
      const { groupCode, fileId } = c.req.query() as { groupCode: string; fileId: string }
      if (!groupCode || !fileId) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const res = await ctx.ntFileApi.getFileUrl(fileId, true, groupCode)
      if (res.retCode !== 0) {
        return c.json({ success: false, message: res.retMsg || '获取下载链接失败' }, 500)
      }
      return c.json({ success: true, data: { url: res.url } })
    } catch (e) {
      ctx.logger.error('获取群文件下载链接失败:', e)
      return c.json({ success: false, message: '获取群文件下载链接失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/group-file/upload', async (c) => {
    try {
      const { groupCode, filePath, fileName, folderId } = await c.req.json() as {
        groupCode: string | number
        filePath: string
        fileName: string
        folderId?: string
      }
      if (!groupCode || !filePath || !fileName) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      if (fileName.includes('/') || fileName.includes('\\')) {
        return c.json({ success: false, message: `文件名 ${fileName} 不合法` }, 400)
      }
      const info = await ctx.ntFileApi.uploadGroupFile(+groupCode, filePath, fileName, folderId || '/')
      const result = await ctx.ntMsgApi.sendGroupFileMessage(+groupCode, info.fileId, info.busId)
      if (result.retCode !== 0) {
        return c.json({ success: false, message: result.clientWording || '发送群文件失败' }, 500)
      }
      return c.json({ success: true, data: { fileId: info.fileId } })
    } catch (e) {
      ctx.logger.error('上传群文件失败:', e)
      return c.json({ success: false, message: '上传群文件失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/group-file/delete', async (c) => {
    try {
      const { groupCode, fileId, busId } = await c.req.json() as {
        groupCode: string | number
        fileId: string
        busId?: number
      }
      if (!groupCode || !fileId) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const res = await ctx.ntGroupApi.deleteGroupFile(+groupCode, fileId, busId ?? 102)
      if (res.retCode !== 0) {
        return c.json({ success: false, message: res.clientWording || '删除群文件失败' }, 500)
      }
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('删除群文件失败:', e)
      return c.json({ success: false, message: '删除群文件失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/group-file/rename', async (c) => {
    try {
      const { groupCode, fileId, parentFolderId, newName } = await c.req.json() as {
        groupCode: string | number
        fileId: string
        parentFolderId?: string
        newName: string
      }
      if (!groupCode || !fileId || !newName) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const res = await ctx.ntGroupApi.renameGroupFile(+groupCode, fileId, parentFolderId || '/', newName)
      if (res.retCode !== 0) {
        return c.json({ success: false, message: res.clientWording || '重命名群文件失败' }, 500)
      }
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('重命名群文件失败:', e)
      return c.json({ success: false, message: '重命名群文件失败', error: (e as Error).message }, 500)
    }
  })

  // 只能建在根目录
  router.post('/group-folder/create', async (c) => {
    try {
      const { groupCode, folderName } = await c.req.json() as {
        groupCode: string | number
        folderName: string
      }
      if (!groupCode || !folderName) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const res = await ctx.ntGroupApi.createGroupFolder(+groupCode, folderName)
      if (res.retCode !== 0) {
        return c.json({ success: false, message: res.clientWording || '新建文件夹失败' }, 500)
      }
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('新建群文件夹失败:', e)
      return c.json({ success: false, message: '新建文件夹失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/group-folder/delete', async (c) => {
    try {
      const { groupCode, folderId } = await c.req.json() as {
        groupCode: string | number
        folderId: string
      }
      if (!groupCode || !folderId) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const res = await ctx.ntGroupApi.deleteGroupFolder(+groupCode, folderId)
      if (res.retCode !== 0) {
        return c.json({ success: false, message: res.clientWording || '删除文件夹失败' }, 500)
      }
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('删除群文件夹失败:', e)
      return c.json({ success: false, message: '删除文件夹失败', error: (e as Error).message }, 500)
    }
  })

  router.post('/group-folder/rename', async (c) => {
    try {
      const { groupCode, folderId, newName } = await c.req.json() as {
        groupCode: string | number
        folderId: string
        newName: string
      }
      if (!groupCode || !folderId || !newName) {
        return c.json({ success: false, message: '缺少必要参数' }, 400)
      }
      const res = await ctx.ntGroupApi.renameGroupFolder(+groupCode, folderId, newName)
      if (res.retCode !== 0) {
        return c.json({ success: false, message: res.clientWording || '重命名文件夹失败' }, 500)
      }
      return c.json({ success: true })
    } catch (e) {
      ctx.logger.error('重命名群文件夹失败:', e)
      return c.json({ success: false, message: '重命名文件夹失败', error: (e as Error).message }, 500)
    }
  })

  return router
}
