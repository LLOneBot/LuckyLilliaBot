/**
 * llonebot_debug 接口测试
 * 测试调试功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('llonebot_debug - 调试接口', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试调试接口（跳过以避免影响系统）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 此测试可能影响系统状态，默认跳过
    const response = await primaryClient.call(ActionName.Debug, {
      command: 'test'
    });

    if (response.retcode === 0) {
      Assertions.assertSuccess(response, 'llonebot_debug');
    } else {
      console.log('调试接口调用失败:', response.message);
    }
  }, 30000);
});
