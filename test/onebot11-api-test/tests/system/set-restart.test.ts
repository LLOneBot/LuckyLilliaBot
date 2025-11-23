/**
 * set_restart 接口测试
 * 测试重启功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_restart - 重启', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试重启（跳过以避免真实重启）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 此测试会导致真实重启，默认跳过
    const response = await primaryClient.call(ActionName.SetRestart, {
      delay: 1000
    });

    Assertions.assertSuccess(response, 'set_restart');
  }, 30000);
});
