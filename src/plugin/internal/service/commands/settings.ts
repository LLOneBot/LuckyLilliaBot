import Schema from 'schemastery'
import type { BuiltinConfig } from '../../../host'
import { DEFAULT_SETTINGS, type CommandSettings } from '../../../../universal/commands'

export const CommandsSchema: Schema<CommandSettings> = Schema.object({
  prefixes: Schema.array(Schema.string()).default(DEFAULT_SETTINGS.prefixes).description('指令前缀：消息以其中一个开头就算指令'),
  bare: Schema.boolean().default(DEFAULT_SETTINGS.bare).description('不写前缀也算指令'),
  owners: Schema.array(Schema.string()).default([])
    .description('主人：能用所有指令的人。写「平台:用户 id」，比如 luckylillia:12345、qq:用户的 openid；只写 id 时所有平台都算'),
}) as Schema<CommandSettings>

export const commandsSettings: BuiltinConfig<CommandSettings> = {
  // A blank row the list leaves behind is no prefix: `bare` says whether none is needed
  normalize: value => ({
    ...value,
    prefixes: (value.prefixes ?? []).map(prefix => prefix.trim()).filter(Boolean),
    owners: (value.owners ?? []).map(owner => owner.trim()).filter(Boolean),
  }),
}
