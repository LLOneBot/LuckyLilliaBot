// Bundles the bot's neutral layer with a fake bot into lib/testing.js: @luckylillia/plugin-sdk/testing. Its types
// are src/testing.ts. The packages a plugin shares with the bot stay imports, as in a plugin build.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const sdk = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [path.resolve(sdk, '../../src/universal/testing.ts')],
  outfile: path.join(sdk, 'lib/testing.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['cordis', 'cosmokit', 'schemastery', '@satorijs/element', '@satorijs/protocol', '@cordisjs/plugin-timer'],
  logLevel: 'warning',
})
