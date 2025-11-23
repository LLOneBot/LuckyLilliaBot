/**
 * set_friend_add_request 接口测试
 * 测试处理好友请求功能
 * 
 * 注意：此测试需要有实际的好友请求才能执行
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_friend_add_request - 处理好友请求', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试同意好友请求', async () => {
    // 此测试需要有实际的好友请求，通常需要手动触发
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetFriendAddRequest, {
      flag: 'test_flag', // 需要实际的 flag
      approve: true,
      remark: '测试好友'
    });

    Assertions.assertSuccess(response, 'set_friend_add_request');
  }, 30000);

  it.skip('测试拒绝好友请求', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetFriendAddRequest, {
      flag: 'test_flag',
      approve: false
    });

    Assertions.assertSuccess(response, 'set_friend_add_request');
  }, 30000);
});
