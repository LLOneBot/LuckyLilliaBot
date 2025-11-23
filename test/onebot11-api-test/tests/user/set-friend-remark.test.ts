/**
 * set_friend_remark 接口测试
 * 测试设置好友备注功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_friend_remark - 设置好友备注', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试设置好友备注', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const newRemark = `测试备注_${Date.now()}`;

    const response = await primaryClient.call(ActionName.SetFriendRemark, {
      user_id: context.secondaryUserId,
      remark: newRemark
    });

    Assertions.assertSuccess(response, 'set_friend_remark');
  }, 30000);
});
