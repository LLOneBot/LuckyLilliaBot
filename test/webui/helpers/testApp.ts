import { Hono } from 'hono'
import { authMiddleware } from '@/webui/BE/auth'

/** 不带鉴权 */
export function createTestApp(subrouter: Hono, prefix = '/') {
  const app = new Hono()
  app.route(prefix, subrouter)
  return app
}

/** 注入 mock env, 免得读 c.env.incoming.socket.remoteAddress 报错 */
export function createAuthTestApp() {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.env = { incoming: { socket: { remoteAddress: '127.0.0.1' } } } as any
    return await next()
  })
  app.use('*', authMiddleware)
  app.get('/test', (c) => c.json({ success: true, message: 'authenticated' }))
  app.post('/set-token', (c) => c.json({ success: true, message: 'token set' }))
  return app
}
