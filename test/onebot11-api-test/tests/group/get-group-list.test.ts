/**
 * get_group_list 接口测试
 * 测试获取群列表功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_group_list - 获取群列表', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取群列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupList, {});

    Assertions.assertSuccess(response, 'get_group_list');
    Assertions.assertTrue(Array.isArray(response.data), 'Response should be an array');
    Assertions.assertTrue(response.data.length > 0, 'Should have at least one group');

    // 验证第一个群的字段
    const firstGroup = response.data[0];
    Assertions.assertDefined(firstGroup.group_id, 'Group ID should be defined');
    Assertions.assertDefined(firstGroup.group_name, 'Group name should be defined');
  }, 30000);

  it('测试获取群列表 (no_cache=true)', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupList, {
      no_cache: true,
    });

    Assertions.assertSuccess(response, 'get_group_list');
    Assertions.assertTrue(Array.isArray(response.data), 'Response should be an array');
  }, 30000);
});
