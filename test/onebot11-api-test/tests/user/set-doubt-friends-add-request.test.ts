/**
 * set_doubt_friends_add_request 接口测试
 * 测试处理可疑好友请求功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_doubt_friends_add_request - 处理可疑好友请求', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试处理可疑好友请求 (需要实际请求)', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetDoubtFriendsAddRequest, {
      flag: 'test_flag', // 需要实际的 flag
      approve: true
    });

    Assertions.assertSuccess(response, 'set_doubt_friends_add_request');
  }, 30000);
});
