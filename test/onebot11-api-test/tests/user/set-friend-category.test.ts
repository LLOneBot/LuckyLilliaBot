/**
 * set_friend_category 接口测试
 * 测试设置好友分组功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_friend_category - 设置好友分组', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试设置好友分组 (需要分组 ID)', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetFriendCategory, {
      user_id: context.secondaryUserId,
      category_id: 'test_category_id' // 需要实际的分组 ID
    });

    Assertions.assertSuccess(response, 'set_friend_category');
  }, 30000);
});
