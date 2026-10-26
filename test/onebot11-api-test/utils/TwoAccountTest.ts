import { AccountManager } from '../core/AccountManager.js'
import { ApiClient } from '../core/ApiClient.js'
import { EventListener, OB11Event, EventFilter } from '../core/EventListener.js'
import { TwoAccountTest as FrameworkTwoAccountTest } from '../../test-framework/src/index.js'

export type { OB11Event, EventFilter }

export class TwoAccountTest extends FrameworkTwoAccountTest<ApiClient, EventListener> {
  constructor(accountManager: AccountManager) {
    super(accountManager, (client) => new EventListener(client))
  }
}
