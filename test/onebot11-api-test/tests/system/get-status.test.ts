/**
 * get_status 接口测试
 * 测试获取运行状态功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_status - 获取运行状态', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取运行状态', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetStatus, {});

    Assertions.assertSuccess(response, 'get_status');
    Assertions.assertResponseHasFields(response, ['online', 'good']);
    Assertions.assertDefined(response.data.online, 'online 状态应该被定义');
  }, 30000);
});
