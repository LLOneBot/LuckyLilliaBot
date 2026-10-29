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

/**
 * The builtin entries, each defined next to its code in `<category>/<name>/builtin.ts`: the category is the one its
 * manifest gives (the plugin page's grouping), the name the entry's (`builtin:<name>`). The order is the one new
 * entries get in plugins.json.
 */
export const builtinPlugins: BuiltinPlugin[] = [
  webui, dashboard, logs, ntProtocol, onebot11, satori, milky, qqOfficial, webqq, emailNotification, ntqqUniversal,
]
