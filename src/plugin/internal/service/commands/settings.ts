import Schema from 'schemastery'
import type { BuiltinConfig } from '../../../host'
import { DEFAULT_SETTINGS, type CommandSettings } from '../../../../universal/commands'

export const CommandsSchema: Schema<CommandSettings> = Schema.object({
  prefixes: Schema.array(Schema.string()).default(DEFAULT_SETTINGS.prefixes).description('指令前缀：消息以其中一个开头就算指令'),
  bare: Schema.boolean().default(DEFAULT_SETTINGS.bare).description('不写前缀也算指令'),
  owners: Schema.array(Schema.string()).default([])
    .description('主人：能用所有指令的人。写「平台:用户 id」，比如 luckylillia:12345、qq:用户的 openid；只写 id 时所有平台都算'),
  permissions: Schema.array(Schema.object({
    owner: Schema.string().default('').description('指令所属的插件条目'),
    command: Schema.string().required().min(1).description('指令原名'),
    authority: Schema.union(['everyone', 'admin', 'owner']).required().description('谁能用'),
  })).default([]).description('指令权限；没有单独设置时使用插件的默认权限'),
  aliases: Schema.array(Schema.object({
    owner: Schema.string().default('').description('指令所属的插件条目'),
    command: Schema.string().required().min(1).description('指令原名'),
    aliases: Schema.array(Schema.string()).default([]).description('额外的指令别名'),
  })).default([]).description('为每个指令设置多个别名，原名和插件自带的别名仍然有效'),
}) as Schema<CommandSettings>

function normalizePermissions(rows: CommandSettings['permissions']) {
  const entries = new Map<string, NonNullable<CommandSettings['permissions']>[number]>()
  for (const row of rows ?? []) {
    const owner = row.owner.trim()
    const command = row.command.trim()
    if (command) entries.set(JSON.stringify([owner, command.toLowerCase()]), { owner, command, authority: row.authority })
  }
  return [...entries.values()]
}

function normalizeAliases(rows: CommandSettings['aliases']) {
  // Normalization runs before the schema. Leave malformed input for its field-level validation.
  if (rows != null && (!Array.isArray(rows) || rows.some(row =>
    !row || typeof row !== 'object'
    || (row.owner !== undefined && typeof row.owner !== 'string')
    || (row.command !== undefined && typeof row.command !== 'string')
    || (row.aliases !== undefined && (!Array.isArray(row.aliases) || row.aliases.some(alias => typeof alias !== 'string'))),
  ))) return rows
  const entries = new Map<string, NonNullable<CommandSettings['aliases']>[number]>()
  for (const row of rows ?? []) {
    const owner = (row.owner ?? '').trim()
    const command = (row.command ?? '').trim()
    const key = JSON.stringify([owner, command])
    const entry = entries.get(key) ?? { owner, command, aliases: [] }
    const seen = new Set([command, ...entry.aliases].map(name => name.toLowerCase()))
    for (const raw of row.aliases ?? []) {
      const alias = raw.trim()
      if (!alias || seen.has(alias.toLowerCase())) continue
      entry.aliases.push(alias)
      seen.add(alias.toLowerCase())
    }
    if (entry.aliases.length) entries.set(key, entry)
  }
  return [...entries.values()]
}

export const commandsSettings: BuiltinConfig<CommandSettings> = {
  // A blank row the list leaves behind is no prefix: `bare` says whether none is needed
  normalize: value => ({
    ...value,
    prefixes: (value.prefixes ?? []).map(prefix => prefix.trim()).filter(Boolean),
    owners: (value.owners ?? []).map(owner => owner.trim()).filter(Boolean),
    permissions: normalizePermissions(value.permissions),
    aliases: normalizeAliases(value.aliases),
  }),
  check: value => (value.aliases ?? []).flatMap((row, index) => row.aliases.flatMap((alias, aliasIndex) =>
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(alias)
      ? [{ path: ['aliases', String(index), 'aliases', String(aliasIndex)], message: '每个别名只能填写一行，不能包含换行、制表符或其他控制字符' }]
      : [],
  )),
}
