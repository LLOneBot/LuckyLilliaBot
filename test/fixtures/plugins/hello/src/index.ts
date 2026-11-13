import { Context, Schema } from '@luckylillia/plugin-sdk'
import { format } from './format.js'

export const name = 'hello'
export const inject = ['timer']

export interface Config {
  interval: number
  text: string
}

export const Config: Schema<Config> = Schema.object({
  interval: Schema.natural().role('ms').default(60_000).description('打印间隔'),
  text: Schema.string().default('hello').description('打印内容'),
})

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('hello')
  ctx.interval(() => logger.info(format(config.text)), config.interval)
}
