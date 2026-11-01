#!/usr/bin/env node
// luckylillia-plugin create <dir>: a new plugin package from ../template
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const USAGE = 'Usage: luckylillia-plugin create <dir> [--name <package name>] [--description <text>]'
// validate-npm-package-name without its length and reserved-name checks
const PACKAGE_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

const sdk = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  console.error(message)
  process.exit(1)
}

let args
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      description: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
} catch (e) {
  fail(`${e.message}\n${USAGE}`)
}
const [command, dir, ...extra] = args.positionals
if (args.values.help) {
  console.log(USAGE)
  process.exit(0)
}
if (command !== 'create' || !dir || extra.length) fail(USAGE)

const target = path.resolve(dir)
if (existsSync(target) && readdirSync(target).length) fail(`${target} is not empty`)
const base = path.basename(target)
const name = args.values.name ?? (base.startsWith('luckylillia-plugin-') ? base : `luckylillia-plugin-${base}`)
if (!PACKAGE_NAME.test(name)) fail(`"${name}" is not a valid npm package name, pick one with --name`)
const id = name.replace(/^@[^/]+\//, '').replace(/^luckylillia-plugin-/, '')
const values = {
  name,
  id,
  sdk: JSON.parse(readFileSync(path.join(sdk, 'package.json'), 'utf8')).version,
  description: args.values.description ?? `${id} 插件`,
}

cpSync(path.join(sdk, 'template'), target, { recursive: true })
// npm publish drops a .gitignore, so the template carries it without the dot
renameSync(path.join(target, 'gitignore'), path.join(target, '.gitignore'))
for (const relative of readdirSync(target, { recursive: true })) {
  const file = path.join(target, relative)
  if (!statSync(file).isFile()) continue
  const text = readFileSync(file, 'utf8')
  const json = file.endsWith('.json')
  const filled = text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in values)) return match
    return json ? JSON.stringify(values[key]).slice(1, -1) : values[key]
  })
  if (filled !== text) writeFileSync(file, filled)
}

console.log(`Created ${name} in ${target}

Next:
  cd ${path.relative(process.cwd(), target) || '.'}
  npm install
  npm test`)
