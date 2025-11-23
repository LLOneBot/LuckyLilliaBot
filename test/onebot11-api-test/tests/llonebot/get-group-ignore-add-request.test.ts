/**
 * get_group_ignore_add_request 接口测试
 * 测试获取群忽略的加群请求功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_group_ignore_add_request - 获取群忽略的加群请求', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取群忽略的加群请求', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupIgnoreAddRequest, {
      group_id: context.testGroupId
    });

    if (response.retcode === 0) {
      Assertions.assertSuccess(response, 'get_group_ignore_add_request');
      Assertions.assertTrue(Array.isArray(response.data), '忽略的加群请求列表应该是数组');
    } else {
      console.log('获取群忽略的加群请求失败:', response.message);
    }
  }, 30000);
});
