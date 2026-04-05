import { Context } from 'cordis'
import path from 'path'
import { existsSync } from 'node:fs'
import { decodeSilk } from '@/common/utils/audio'
import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'

export function createProxyRoutes(ctx: Context): Hono {
  const router = new Hono()

  // 本地文件代理接口 - 用于视频封面等本地文件
  router.get('/file-proxy', async (c) => {
    try {
      const filePath = c.req.query('path')
      if (!filePath) {
        return c.json({ success: false, message: '缺少文件路径参数' }, 400)
      }

      const normalizedPath = path.normalize(filePath)
      if (!existsSync(normalizedPath)) {
        return c.json({ success: false, message: '文件不存在' }, 404)
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

      c.header('Content-Type', contentType)
      c.header('Cache-Control', 'public, max-age=86400')
      return c.body(await readFile(normalizedPath))
    } catch (e) {
      ctx.logger.error('文件代理失败:', e)
      return c.json({ success: false, message: '文件代理失败', error: (e as Error).message }, 500)
    }
  })

  // 图片代理接口 - 解决跨域和 Referer 问题
  router.get('/image-proxy', async (c) => {
    try {
      const urlParam = c.req.query('url')
      if (!urlParam) {
        return c.json({ success: false, message: '缺少图片URL参数' }, 400)
      }

      let url = decodeURIComponent(urlParam)
      // ctx.logger.info('图片代理请求:', url)

      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch (e) {
        return c.json({ success: false, message: '无效的URL' }, 400)
      }

      const allowedHosts = ['gchat.qpic.cn', 'multimedia.nt.qq.com.cn', 'c2cpicdw.qpic.cn', 'p.qlogo.cn', 'q1.qlogo.cn']
      if (!allowedHosts.some(host => parsedUrl.hostname.includes(host))) {
        return c.json({ success: false, message: '不允许代理此域名的图片' }, 403)
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
              // ctx.logger.info('已添加 rkey 到图片 URL')
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
        return c.json({ success: false, message: `获取图片失败: ${response.statusText}` }, response.status as 400)
      }

      const contentType = response.headers.get('content-type') || 'image/png'
      c.header('Content-Type', contentType)
      c.header('Cache-Control', 'public, max-age=86400')
      c.header('Access-Control-Allow-Origin', '*')

      const buffer = await response.arrayBuffer()
      return c.body(buffer)
    } catch (e) {
      ctx.logger.error('图片代理失败:', e)
      return c.json({ success: false, message: '图片代理失败', error: (e as Error).message }, 500)
    }
  })

  // 语音代理接口 - 获取语音并转换为浏览器可播放格式
  router.get('/audio-proxy', async (c) => {
    try {
      const fileUuid = c.req.query('fileUuid')
      const filePath = c.req.query('filePath')
      const isGroup = c.req.query('isGroup') === 'true'

      if (!fileUuid && !filePath) {
        return c.json({ success: false, message: '缺少 fileUuid 或 filePath 参数' }, 400)
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
          return c.json({ success: false, message: '获取语音URL失败' }, 404)
        }

        ctx.logger.info('语音URL:', url)

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        })

        if (!response.ok) {
          ctx.logger.warn('语音代理请求失败:', response.status, response.statusText)
          return c.json({ success: false, message: `获取语音失败: ${response.statusText}` }, response.status as 400)
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

        c.header('Content-Type', 'audio/mpeg')
        c.header('Cache-Control', 'public, max-age=86400')
        c.header('Access-Control-Allow-Origin', '*')
        return c.body(mp3Buffer)
      } catch (decodeError) {
        ctx.logger.error('silk 解码失败:', decodeError)
        return c.json({ success: false, message: '语音解码失败', error: String(decodeError) }, 500)
      }
    } catch (e) {
      ctx.logger.error('语音代理失败:', e)
      return c.json({ success: false, message: '语音代理失败', error: (e as Error).message }, 500)
    }
  })

  return router
}
