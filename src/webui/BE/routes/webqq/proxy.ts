import { Router, Request, Response } from 'express'
import { Context } from 'cordis'
import path from 'path'
import { existsSync } from 'node:fs'
import { decodeSilk } from '@/common/utils/audio'

export function createProxyRoutes(ctx: Context): Router {
  const router = Router()

  // 本地文件代理接口 - 用于视频封面等本地文件
  router.get('/file-proxy', async (req: Request, res: Response) => {
    try {
      const filePath = req.query.path as string
      if (!filePath) {
        res.status(400).json({ success: false, message: '缺少文件路径参数' })
        return
      }

      const normalizedPath = path.normalize(filePath)
      if (!existsSync(normalizedPath)) {
        res.status(404).json({ success: false, message: '文件不存在' })
        return
      }

      const ext = path.extname(normalizedPath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
      }
      const contentType = mimeTypes[ext] || 'application/octet-stream'

      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.sendFile(normalizedPath)
    } catch (e: any) {
      ctx.logger.error('文件代理失败:', e)
      res.status(500).json({ success: false, message: '文件代理失败', error: e.message })
    }
  })

  // 图片代理接口 - 解决跨域和 Referer 问题
  router.get('/image-proxy', async (req: Request, res: Response) => {
    try {
      const urlParam = req.query.url as string
      if (!urlParam) {
        res.status(400).json({ success: false, message: '缺少图片URL参数' })
        return
      }

      let url = decodeURIComponent(urlParam)
      ctx.logger.info('图片代理请求:', url)

      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch (e) {
        res.status(400).json({ success: false, message: '无效的URL' })
        return
      }

      const allowedHosts = ['gchat.qpic.cn', 'multimedia.nt.qq.com.cn', 'c2cpicdw.qpic.cn', 'p.qlogo.cn', 'q1.qlogo.cn']
      if (!allowedHosts.some(host => parsedUrl.hostname.includes(host))) {
        res.status(403).json({ success: false, message: '不允许代理此域名的图片' })
        return
      }

      // 如果 URL 没有 rkey，尝试添加
      if (!url.includes('rkey=') && (parsedUrl.hostname.includes('multimedia.nt.qq.com.cn') || parsedUrl.hostname.includes('gchat.qpic.cn'))) {
        try {
          const appid = parsedUrl.searchParams.get('appid')
          if (appid && ['1406', '1407'].includes(appid)) {
            const rkeyData = await ctx.ntFileApi.rkeyManager.getRkey()
            const rkey = appid === '1406' ? rkeyData.private_rkey : rkeyData.group_rkey
            if (rkey) {
              url = url + rkey
              ctx.logger.info('已添加 rkey 到图片 URL')
            }
          }
        } catch (e) {
          ctx.logger.warn('添加 rkey 失败:', e)
        }
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        }
      })

      if (!response.ok) {
        ctx.logger.warn('图片代理请求失败:', response.status, response.statusText)
        res.status(response.status).json({ success: false, message: `获取图片失败: ${response.statusText}` })
        return
      }

      const contentType = response.headers.get('content-type') || 'image/png'
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.setHeader('Access-Control-Allow-Origin', '*')

      const buffer = await response.arrayBuffer()
      res.send(Buffer.from(buffer))
    } catch (e: any) {
      ctx.logger.error('图片代理失败:', e)
      res.status(500).json({ success: false, message: '图片代理失败', error: e.message })
    }
  })

  // 语音代理接口 - 获取语音并转换为浏览器可播放格式
  router.get('/audio-proxy', async (req: Request, res: Response) => {
    try {
      const fileUuid = req.query.fileUuid as string
      const filePath = req.query.filePath as string
      const isGroup = req.query.isGroup === 'true'

      if (!fileUuid && !filePath) {
        res.status(400).json({ success: false, message: '缺少 fileUuid 或 filePath 参数' })
        return
      }

      ctx.logger.info('语音代理请求:', { fileUuid, filePath, isGroup })

      const fs = await import('fs/promises')
      const pathModule = await import('path')
      const os = await import('os')
      const { randomUUID } = await import('crypto')

      let audioFilePath: string = ''

      // 优先使用本地文件路径
      if (filePath) {
        const decodedPath = decodeURIComponent(filePath)
        try {
          await fs.access(decodedPath)
          audioFilePath = decodedPath
          ctx.logger.info('使用本地文件:', audioFilePath)
        } catch {
          ctx.logger.warn('本地文件不存在，尝试从URL获取')
        }
      }

      // 如果本地文件不存在，从URL获取
      if (!audioFilePath && fileUuid) {
        const url = await ctx.ntFileApi.getPttUrl(fileUuid, isGroup)
        if (!url) {
          res.status(404).json({ success: false, message: '获取语音URL失败' })
          return
        }

        ctx.logger.info('语音URL:', url)

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        })

        if (!response.ok) {
          ctx.logger.warn('语音代理请求失败:', response.status, response.statusText)
          res.status(response.status).json({ success: false, message: `获取语音失败: ${response.statusText}` })
          return
        }

        const audioBuffer = Buffer.from(await response.arrayBuffer())
        const tempDir = os.tmpdir()
        audioFilePath = pathModule.join(tempDir, `ptt_${randomUUID()}.silk`)
        await fs.writeFile(audioFilePath, audioBuffer)
      }

      // 转换为 mp3
      try {
        const mp3Path = await decodeSilk(ctx, audioFilePath, 'mp3')
        const mp3Buffer = await fs.readFile(mp3Path)

        // 清理临时文件
        const os = await import('os')
        if (audioFilePath.includes(os.tmpdir())) {
          fs.unlink(audioFilePath).catch(() => { })
        }
        fs.unlink(mp3Path).catch(() => { })

        res.setHeader('Content-Type', 'audio/mpeg')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.send(mp3Buffer)
      } catch (decodeError) {
        ctx.logger.error('silk 解码失败:', decodeError)
        res.status(500).json({ success: false, message: '语音解码失败', error: String(decodeError) })
      }
    } catch (e: any) {
      ctx.logger.error('语音代理失败:', e)
      res.status(500).json({ success: false, message: '语音代理失败', error: e.message })
    }
  })

  return router
}
