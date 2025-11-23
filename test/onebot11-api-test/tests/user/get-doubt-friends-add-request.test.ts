/**
 * get_doubt_friends_add_request 接口测试
 * 测试获取可疑好友请求功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_doubt_friends_add_request - 获取可疑好友请求', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取可疑好友请求列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetDoubtFriendsAddRequest, {
      count: 20
    });

    Assertions.assertSuccess(response, 'get_doubt_friends_add_request');
    Assertions.assertDefined(response.data, '可疑好友请求列表应该被定义');
  }, 30000);
});
