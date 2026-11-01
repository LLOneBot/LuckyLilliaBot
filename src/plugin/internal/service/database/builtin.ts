import type { BuiltinPlugin } from '../../../host'
import * as DatabasePlugin from '.'

export const builtin: BuiltinPlugin = {
  // Not core: a plugin implementing `database` (MySQL, say) can take its place
  name: 'builtin:database',
  title: '数据库',
  plugin: DatabasePlugin,
  manifest: {
    category: 'service',
    icon: 'database',
    service: { implements: ['database', 'model'], labels: { database: '数据库' } },
    description: {
      zh: '插件的数据库：实例目录下的一个 SQLite 文件，不用登录就有，所有账号共用',
      en: 'The plugins\' database: one SQLite file in the instance directory, there without a login and shared by every account',
    },
  },
}
