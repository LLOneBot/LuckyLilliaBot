import { Context, h, Schema } from '@luckylillia/plugin-sdk'

export const name = 'custom-config'
export const inject = ['bots']

export interface Config {
  words: string[]
  replacement: string
}

// Still the source of defaults and validation: the custom editor only changes how it is edited
export const Config: Schema<Config> = Schema.object({
  words: Schema.array(Schema.string().min(1)).default(['示例词']).description('要替换掉的词'),
  replacement: Schema.string().min(1).default('***').description('替换成'),
})

/** Masks the configured words in what plugins send through the neutral layer. */
export function apply(ctx: Context, config: Config) {
  ctx.on('bot/before-send', (_bot, _channelId, content, next) => {
    for (const [index, element] of content.entries()) {
      if (element.type !== 'text') continue
      let text = String(element.attrs.content ?? '')
      for (const word of config.words) text = text.split(word).join(config.replacement)
      content[index] = h.text(text)
    }
    return next()
  })
}
