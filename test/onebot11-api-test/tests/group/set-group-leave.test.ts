/**
 * set_group_leave 接口测试
 * 测试退出群聊功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_group_leave - 退出群聊', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试退出群聊（跳过以避免真实退群）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 此测试会导致真实退群，默认跳过
    const response = await primaryClient.call(ActionName.SetGroupLeave, {
      group_id: context.testGroupId,
      is_dismiss: false
    });

    Assertions.assertSuccess(response, 'set_group_leave');
  }, 30000);
});
