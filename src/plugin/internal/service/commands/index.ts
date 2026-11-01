import { Context } from 'cordis'
import { Hono } from 'hono'
import { CommandService, type CommandSettings } from '../../../../universal/commands'
import { CommandsSchema } from './settings'

export const name = 'commands'
export const Config = CommandsSchema

/**
 * The command service under the settings of its entry. A change of them applies in place: restarting the service
 * would restart every plugin with commands.
 */
export function apply(ctx: Context, config: CommandSettings) {
  const settings = { current: config }
  ctx.on('internal/update', (next: CommandSettings) => {
    settings.current = next
  })
  ctx.plugin(CommandService, settings)
  ctx.inject(['webuiServer', 'commands'], (ctx) => {
    const routes = new Hono()
    routes.get('/commands', c => c.json({ success: true, data: ctx.commands.list() }))
    ctx.webuiServer.route('/api/commands', new Hono().route('/api', routes))
  })
}
