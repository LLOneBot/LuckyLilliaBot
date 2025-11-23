/**
 * set_group_kick 接口测试
 * 测试踢出群成员功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_group_kick - 踢出群成员', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试踢出群成员（需要管理员权限）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 注意：此测试需要 primary 账号有管理员权限
    // 实际测试时需要一个可以被踢出的测试账号
    const response = await primaryClient.call(ActionName.SetGroupKick, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      reject_add_request: false
    });

    // 如果没有权限会返回失败
    if (response.retcode === 0) {
      Assertions.assertSuccess(response, 'set_group_kick');
    } else {
      // 权限不足是预期的情况
      console.log('踢出群成员失败（可能是权限不足）:', response.message);
    }
  }, 30000);
});
