import { Context } from 'cordis'
import { Hono } from 'hono'
import { createLogsRoutes } from './routes'

export { createLogsRoutes }

/** builtin:logs: the log stream its page (`client/`) shows. */
export const Logs = {
  name: 'builtin:logs',
  inject: ['webuiServer'],
  apply(ctx: Context) {
    ctx.webuiServer.route('/api/logs', new Hono().route('/api', createLogsRoutes(ctx)))
  },
}
