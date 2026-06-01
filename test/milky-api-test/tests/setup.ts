import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ConfigLoader,
  AccountManager,
  TwoAccountTest,
  UnifiedConfigLoader,
  type TestConfig,
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

/** 加载配置: 优先 milky-api-test/config/test.config.json (向后兼容), fallback 项目级 test/test.config.json */
function loadMilkyConfig(): TestConfig {
  const legacyPath = path.resolve(__dirname, '../config/test.config.json')
  if (fs.existsSync(legacyPath)) {
    return ConfigLoader.load(legacyPath)
  }
  const { config: unified } = UnifiedConfigLoader.loadUnified()
  return UnifiedConfigLoader.forMilky(unified)
}

export async function setupMilkyTest(): Promise<MilkyTestContext> {
  const config = loadMilkyConfig()
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
