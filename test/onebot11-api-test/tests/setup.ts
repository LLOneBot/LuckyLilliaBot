import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigLoader } from '../config/ConfigLoader';
import { AccountManager } from '../core/AccountManager';
import { TwoAccountTest } from '../utils/TwoAccountTest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MessageTestContext {
  accountManager: AccountManager;
  twoAccountTest: TwoAccountTest;
  testTimeout: number;
  testGroupId: string;
  primaryUserId: string;
  secondaryUserId: string;
}

export async function setupMessageTest(): Promise<MessageTestContext> {
  const config = ConfigLoader.load(path.resolve(__dirname, '../config/test.config.json'));
  const testTimeout = config.timeout || 30000;
  const accountManager = new AccountManager(config);
  const twoAccountTest = new TwoAccountTest(accountManager);

  await twoAccountTest.startAllListeners();

  const primaryUserId = config.accounts.primary.user_id;
  const secondaryUserId = config.accounts.secondary.user_id;
  const testGroupId = config.test_group_id;

  return {
    accountManager,
    twoAccountTest,
    testTimeout,
    testGroupId,
    primaryUserId,
    secondaryUserId,
  };
}

export function teardownMessageTest(context: MessageTestContext): void {
  context.twoAccountTest.stopAllListeners();
}

export function clearQueues(context: MessageTestContext): void {
  context.twoAccountTest.clearAllQueues();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
