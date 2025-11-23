/**
 * get_group_add_request 接口测试
 * 测试获取加群请求列表功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_group_add_request - 获取加群请求列表', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取加群请求列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupSystemMsg, {
      group_id: context.testGroupId
    });

    Assertions.assertSuccess(response, 'get_group_add_request');
    Assertions.assertDefined(response.data, '加群请求列表应该被定义');
  }, 30000);
});
