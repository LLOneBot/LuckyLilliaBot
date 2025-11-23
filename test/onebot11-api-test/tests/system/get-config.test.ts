/**
 * get_config 接口测试
 * 测试获取配置功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_config - 获取配置', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取配置', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetConfig, {});

    Assertions.assertSuccess(response, 'get_config');
    Assertions.assertDefined(response.data, '配置应该被定义');
  }, 30000);
});
