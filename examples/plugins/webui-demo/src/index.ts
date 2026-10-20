import { Context, Schema } from '@luckylillia/plugin-sdk'

export const name = 'webui-demo'
export const inject = ['webuiServer']

export interface Config {
  greeting: string
  color: string
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('你好，WebUI').description('页面上的问候语'),
  // Rendered by the color field this plugin's WebUI module registers for the role
  color: Schema.string().role('color').default('#ec4899').description('强调色'),
})

export function apply(ctx: Context, config: Config) {
  let clicks = 0
  // The route table takes anything with fetch(request): no web framework needed for a route or two
  ctx.webuiServer.route('/api/webui-demo', {
    async fetch(request) {
      if (new URL(request.url).pathname !== '/api/webui-demo/state') {
        return Response.json({ success: false, message: 'not found' }, { status: 404 })
      }
      if (request.method === 'POST') clicks++
      return Response.json({ success: true, data: { clicks, greeting: config.greeting, color: config.color } })
    },
  })
}
