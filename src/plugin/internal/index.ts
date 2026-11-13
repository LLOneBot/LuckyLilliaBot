import type { BuiltinPlugin } from '../host'
import { builtin as webui } from './service/webui/builtin'
import { builtin as dashboard } from './tool/dashboard/builtin'
import { builtin as logs } from './tool/logs/builtin'
import { builtin as ntProtocol } from './protocol/nt-protocol/builtin'
import { builtin as onebot11 } from './adapter/onebot11/builtin'
import { builtin as satori } from './adapter/satori/builtin'
import { builtin as milky } from './adapter/milky/builtin'
import { builtin as qqOfficial } from './protocol/qq-official/builtin'
import { builtin as webqq } from './tool/webqq/builtin'
import { builtin as emailNotification } from './tool/email-notification/builtin'
import { builtin as ntqqUniversal } from './service/ntqq-universal/builtin'
import { builtin as commands } from './service/commands/builtin'
import { builtin as database } from './service/database/builtin'
import { builtin as market } from './tool/market/builtin'
import { builtin as proxy } from './service/proxy/builtin'
import { builtin as messageOrder } from './tool/message-order/builtin'
import './runtime-imports'
import webuiPackage from './service/webui/package.json'
import dashboardPackage from './tool/dashboard/package.json'
import logsPackage from './tool/logs/package.json'
import ntProtocolPackage from './protocol/nt-protocol/package.json'
import onebot11Package from './adapter/onebot11/package.json'
import satoriPackage from './adapter/satori/package.json'
import milkyPackage from './adapter/milky/package.json'
import qqOfficialPackage from './protocol/qq-official/package.json'
import webqqPackage from './tool/webqq/package.json'
import emailNotificationPackage from './tool/email-notification/package.json'
import ntqqUniversalPackage from './service/ntqq-universal/package.json'
import commandsPackage from './service/commands/package.json'
import databasePackage from './service/database/package.json'
import marketPackage from './tool/market/package.json'
import proxyPackage from './service/proxy/package.json'
import messageOrderPackage from './tool/message-order/package.json'

const packages = [webuiPackage, dashboardPackage, logsPackage, ntProtocolPackage, onebot11Package, satoriPackage,
  milkyPackage, qqOfficialPackage, webqqPackage, emailNotificationPackage, ntqqUniversalPackage, commandsPackage,
  databasePackage, marketPackage, proxyPackage, messageOrderPackage]
const packagesByEntry = new Map(packages.map(pkg => [pkg.llbot.builtin.entry, pkg]))

/**
 * The builtin entries, each defined next to its code in `<category>/<name>/builtin.ts`: the category is the one its
 * manifest gives (the plugin page's grouping), the name the entry's (`builtin:<name>`). The order is the one new
 * entries get in plugins.json.
 */
export const builtinPlugins: BuiltinPlugin[] = [
  webui, dashboard, logs, ntProtocol, onebot11, satori, milky, qqOfficial, webqq, emailNotification, ntqqUniversal, commands, database,
  market, proxy, messageOrder,
].map(builtin => {
  const pkg = packagesByEntry.get(builtin.name)
  if (!pkg) throw new Error('Builtin has no npm package: ' + builtin.name)
  return { ...builtin, npm: { name: pkg.name, version: pkg.version, abi: pkg.llbot.builtin.abi } }
})
