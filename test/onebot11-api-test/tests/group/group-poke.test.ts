/**
 * group_poke 接口测试
 * 测试群戳一戳功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('group_poke - 群戳一戳', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试在群里戳一戳成员', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GroupPoke, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId
    });

    Assertions.assertSuccess(response, 'group_poke');

    // 等待戳一戳通知
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'notify',
      sub_type: 'poke',
      group_id: Number(context.testGroupId),
      user_id: Number(context.primaryUserId),
      target_id: Number(context.secondaryUserId),
    }, undefined, 10000);
  }, 30000);
});
