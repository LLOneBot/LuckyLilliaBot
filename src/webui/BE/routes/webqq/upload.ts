import { Router } from 'express'
import { Context } from 'cordis'
import path from 'path'
import { promises as fsPromises } from 'node:fs'
import multer from 'multer'

export function createUploadRoutes(ctx: Context, upload: multer.Multer, fileUpload: multer.Multer, uploadDir: string): Router {
  const router = Router()

  // 上传图片
  router.post('/upload', upload.single('image'), async (req, res) => {
    try {
      // 支持通过 URL 上传
      const imageUrl = req.body?.imageUrl as string
      if (imageUrl) {
        const response = await fetch(imageUrl)
        if (!response.ok) {
          res.status(400).json({ success: false, message: '下载图片失败' })
          return
        }
        const buffer = Buffer.from(await response.arrayBuffer())
        const ext = imageUrl.includes('.gif') ? '.gif' : imageUrl.includes('.png') ? '.png' : '.jpg'
        const filename = `url_${Date.now()}${ext}`
        const filePath = path.join(uploadDir, filename)
        await fsPromises.writeFile(filePath, buffer)
        res.json({
          success: true,
          data: {
            imagePath: filePath,
            filename
          }
        })
        return
      }

      if (!req.file) {
        res.status(400).json({ success: false, message: '没有上传文件' })
        return
      }

      res.json({
        success: true,
        data: {
          imagePath: req.file.path,
          filename: req.file.filename
        }
      })
    } catch (e: any) {
      ctx.logger.error('上传图片失败:', e)
      res.status(500).json({ success: false, message: '上传图片失败', error: e.message })
    }
  })

  // 上传文件（用于发送文件消息）
  router.post('/upload-file', fileUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: '没有上传文件' })
        return
      }

      // 修复中文文件名编码问题
      const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8')

      res.json({
        success: true,
        data: {
          filePath: req.file.path,
          fileName,
          fileSize: req.file.size
        }
      })
    } catch (e: any) {
      ctx.logger.error('上传文件失败:', e)
      res.status(500).json({ success: false, message: '上传文件失败', error: e.message })
    }
  })

  return router
}
