import { Context } from 'cordis'
import { PluginRoutes } from './routes/plugins'
import { WebuiServer } from './server'

/**
 * builtin:webui, a core entry: the server and its route table, which the other plugins' pages and API hang on,
 * and the plugin management behind the plugin page.
 */
export const WebUI = {
  name: 'builtin:webui',
  apply(ctx: Context) {
    ctx.plugin(WebuiServer)
    ctx.plugin(PluginRoutes)
  },
}
