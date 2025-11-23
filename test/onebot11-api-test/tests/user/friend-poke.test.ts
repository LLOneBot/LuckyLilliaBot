/**
 * friend_poke 接口测试
 * 测试好友戳一戳功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('friend_poke - 好友戳一戳', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试戳一戳好友', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.FriendPoke, {
      user_id: context.secondaryUserId
    });

    Assertions.assertSuccess(response, 'friend_poke');

    // 等待戳一戳通知
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'notify',
      sub_type: 'poke',
      user_id: Number(context.primaryUserId),
    }, undefined, 10000);
  }, 30000);
});
