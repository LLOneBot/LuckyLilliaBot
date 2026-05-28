import { AccountManager } from '../core/AccountManager.js'
import { ApiClient } from '../core/ApiClient.js'
import { EventListener, OB11Event, EventFilter } from '../core/EventListener.js'
import { TwoAccountTest as FrameworkTwoAccountTest } from '../../test-framework/src/index.js'

// 重新导出供测试 import 用
export type { OB11Event, EventFilter }

/**
 * OB11 双账号测试编排器。在 framework `TwoAccountTest` 之上注入 OB11 EventListener factory。
 */
export class TwoAccountTest extends FrameworkTwoAccountTest<ApiClient, EventListener> {
  constructor(accountManager: AccountManager) {
    super(accountManager, (client) => new EventListener(client))
  }
}
