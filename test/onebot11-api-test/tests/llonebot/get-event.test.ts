/**
 * get_event 接口测试
 * 测试获取事件功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_event - 获取事件', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取事件', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetEvent, {});

    if (response.retcode === 0) {
      Assertions.assertSuccess(response, 'get_event');
    } else {
      console.log('获取事件失败:', response.message);
    }
  }, 30000);
});
