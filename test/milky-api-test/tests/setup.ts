import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ConfigLoader,
  AccountManager,
  TwoAccountTest,
} from '../../test-framework/src/index.js'
import { MilkyApiClient } from '../protocol/ApiClient.js'
import { MilkyEventListener } from '../protocol/EventListener.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface MilkyTestContext {
  accountManager: AccountManager<MilkyApiClient>
  twoAccountTest: TwoAccountTest<MilkyApiClient, MilkyEventListener>
  testTimeout: number
  testGroupId: number
  primaryUserId: number
  secondaryUserId: number
}

export async function setupMilkyTest(): Promise<MilkyTestContext> {
  const config = ConfigLoader.load(path.resolve(__dirname, '../config/test.config.json'))
  const accountManager = new AccountManager<MilkyApiClient>(
    config,
    (account, retries) => new MilkyApiClient(account, retries),
  )
  const twoAccountTest = new TwoAccountTest<MilkyApiClient, MilkyEventListener>(
    accountManager,
    (client) => new MilkyEventListener(client),
  )
  await twoAccountTest.startAllListeners()

  return {
    accountManager,
    twoAccountTest,
    testTimeout: config.timeout || 30000,
    testGroupId: +config.test_group_id,
    primaryUserId: +config.accounts.primary.user_id,
    secondaryUserId: +config.accounts.secondary.user_id,
  }
}

export function teardownMilkyTest(ctx: MilkyTestContext): void {
  ctx.twoAccountTest.stopAllListeners()
}
