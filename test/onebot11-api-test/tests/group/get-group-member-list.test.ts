/**
 * get_group_member_list 接口测试
 * 测试获取群成员列表功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_group_member_list - 获取群成员列表', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取群成员列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupMemberList, {
      group_id: context.testGroupId,
    });

    Assertions.assertSuccess(response, 'get_group_member_list');
    Assertions.assertTrue(Array.isArray(response.data), 'Response should be an array');
    Assertions.assertTrue(response.data.length >= 2, 'Should have at least 2 members (primary and secondary)');

    // 验证第一个成员的字段
    const firstMember = response.data[0];
    Assertions.assertDefined(firstMember.group_id, 'Group ID should be defined');
    Assertions.assertDefined(firstMember.user_id, 'User ID should be defined');
    Assertions.assertDefined(firstMember.nickname, 'Nickname should be defined');
    Assertions.assertDefined(firstMember.role, 'Role should be defined');

    // 验证测试账号在列表中
    const primaryMember = response.data.find((m: any) => m.user_id === Number(context.primaryUserId));
    const secondaryMember = response.data.find((m: any) => m.user_id === Number(context.secondaryUserId));
    
    Assertions.assertDefined(primaryMember, 'Primary user should be in member list');
    Assertions.assertDefined(secondaryMember, 'Secondary user should be in member list');
  }, 30000);
});
