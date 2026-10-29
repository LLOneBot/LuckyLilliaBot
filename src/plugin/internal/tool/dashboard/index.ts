import { Context } from 'cordis'
import { Hono } from 'hono'
import { createDashboardRoutes } from './routes'

export { createDashboardRoutes }

/** builtin:dashboard: what its page (`client/`) shows about the bot process and the machine. */
export const Dashboard = {
  name: 'builtin:dashboard',
  inject: ['webuiServer'],
  apply(ctx: Context) {
    ctx.webuiServer.route('/api/dashboard', new Hono().route('/api', createDashboardRoutes(ctx)))
  },
}
