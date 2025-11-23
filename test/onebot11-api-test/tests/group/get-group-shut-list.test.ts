/**
 * get_group_shut_list 接口测试
 * 测试获取群禁言列表功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_group_shut_list - 获取群禁言列表', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取群禁言列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupShutList, {
      group_id: context.testGroupId
    });

    Assertions.assertSuccess(response, 'get_group_shut_list');
    Assertions.assertDefined(response.data, '禁言列表应该被定义');
  }, 30000);
});
