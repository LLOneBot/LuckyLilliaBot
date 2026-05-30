import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ConfigLoader,
  AccountManager,
  TwoAccountTest,
} from '../../test-framework/src/index.js'
import { SatoriApiClient } from '../protocol/ApiClient.js'
import { SatoriEventListener } from '../protocol/EventListener.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface SatoriTestContext {
  accountManager: AccountManager<SatoriApiClient>
  twoAccountTest: TwoAccountTest<SatoriApiClient, SatoriEventListener>
  testTimeout: number
  testGroupId: string  // satori 协议里 channel id / guild id 都用 string
  primaryUserId: string
  secondaryUserId: string
}

export async function setupSatoriTest(): Promise<SatoriTestContext> {
  const config = ConfigLoader.load(path.resolve(__dirname, '../config/test.config.json'))
  const accountManager = new AccountManager<SatoriApiClient>(
    config,
    (account, retries) => new SatoriApiClient(account, retries),
  )
  const twoAccountTest = new TwoAccountTest<SatoriApiClient, SatoriEventListener>(
    accountManager,
    (client) => new SatoriEventListener(client),
  )
  await twoAccountTest.startAllListeners()

  return {
    accountManager,
    twoAccountTest,
    testTimeout: config.timeout || 30000,
    testGroupId: String(config.test_group_id),
    primaryUserId: String(config.accounts.primary.user_id),
    secondaryUserId: String(config.accounts.secondary.user_id),
  }
}

export function teardownSatoriTest(ctx: SatoriTestContext): void {
  ctx.twoAccountTest.stopAllListeners()
}
