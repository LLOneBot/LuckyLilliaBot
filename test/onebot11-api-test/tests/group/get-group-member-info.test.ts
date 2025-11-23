/**
 * get_group_member_info 接口测试
 * 测试获取群成员信息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_group_member_info - 获取群成员信息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取群成员信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupMemberInfo, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
    });

    Assertions.assertSuccess(response, 'get_group_member_info');
    Assertions.assertResponseHasFields(response, [
      'group_id',
      'user_id',
      'nickname',
      'card',
      'role',
    ]);
    Assertions.assertEqual(response.data.group_id, Number(context.testGroupId), 'Group ID should match');
    Assertions.assertEqual(response.data.user_id, Number(context.secondaryUserId), 'User ID should match');
  }, 30000);

  it('测试获取群成员信息 (no_cache=true)', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupMemberInfo, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      no_cache: true,
    });

    Assertions.assertSuccess(response, 'get_group_member_info');
    Assertions.assertEqual(response.data.user_id, Number(context.secondaryUserId), 'User ID should match');
  }, 30000);
});
