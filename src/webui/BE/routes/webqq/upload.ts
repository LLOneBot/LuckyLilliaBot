import { Context } from 'cordis'
import path from 'path'
import { promises as fsPromises } from 'node:fs'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'

export function createUploadRoutes(ctx: Context, uploadDir: string): Hono {
  const router = new Hono()

  // 上传图片
  router.post('/upload', async (c) => {
    try {
      if (c.req.header('Content-Type')?.includes('application/json')) {
        // 支持通过 URL 上传
        const imageUrl = (await c.req.json()).imageUrl as string
        if (imageUrl) {
          const response = await fetch(imageUrl)
          if (!response.ok) {
            return c.json({ success: false, message: '下载图片失败' }, 400)
          }
          const buffer = Buffer.from(await response.arrayBuffer())
          const ext = imageUrl.includes('.gif') ? '.gif' : imageUrl.includes('.png') ? '.png' : '.jpg'
          const filename = `url_${Date.now()}${ext}`
          const filePath = path.join(uploadDir, filename)
          await fsPromises.writeFile(filePath, buffer)
          return c.json({
            success: true,
            data: {
              imagePath: filePath,
              filename
            }
          })
        }
      }

      const { image } = await c.req.parseBody()
      if (!(image instanceof File)) {
        return c.json({ success: false, message: '没有上传文件' }, 400)
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg']
      if (!allowedTypes.includes(image.type)) {
        throw new Error('不支持的图片格式，仅支持 JPG、PNG、GIF')
      }

      if (image.size > 10 * 1024 * 1024) {
        throw new Error('图片体积超出限制')
      }

      const ext = path.extname(image.name)
      const fileName = `${randomUUID()}${ext}`
      const filePath = path.join(uploadDir, fileName)
      await fsPromises.writeFile(filePath, await image.bytes())

      return c.json({
        success: true,
        data: {
          imagePath: filePath,
          filename: fileName
        }
      })
    } catch (e) {
      ctx.logger.error('上传图片失败:', e)
      return c.json({ success: false, message: '上传图片失败', error: (e as Error).message }, 500)
    }
  })

  // 上传文件（用于发送文件消息）
  router.post('/upload-file', async (c) => {
    try {
      const { file } = await c.req.parseBody()
      if (!(file instanceof File)) {
        return c.json({ success: false, message: '没有上传文件' }, 400)
      }

      const ext = path.extname(file.name)
      const fileName = `${randomUUID()}${ext}`
      const filePath = path.join(uploadDir, fileName)
      await fsPromises.writeFile(filePath, await file.bytes())

      return c.json({
        success: true,
        data: {
          filePath: filePath,
          fileName: file.name,
          fileSize: file.size
        }
      })
    } catch (e) {
      ctx.logger.error('上传文件失败:', e)
      return c.json({ success: false, message: '上传文件失败', error: (e as Error).message }, 500)
    }
  })

  return router
}
