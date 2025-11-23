/**
 * .handle_quick_operation 接口测试
 * 测试快速操作功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('handle_quick_operation - 快速操作', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试快速操作（需要特定事件上下文）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 此测试需要特定的事件上下文，默认跳过
    const response = await primaryClient.call(ActionName.GoCQHTTP_HandleQuickOperation, {
      context: {
        // 事件上下文
      },
      operation: {
        // 操作内容
      }
    });

    if (response.retcode === 0) {
      Assertions.assertSuccess(response, '.handle_quick_operation');
    } else {
      console.log('快速操作失败:', response.message);
    }
  }, 30000);
});
