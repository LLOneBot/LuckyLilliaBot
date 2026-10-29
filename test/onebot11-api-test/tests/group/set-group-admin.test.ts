/** 需要群主权限 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';

describe('set_group_admin - 群组设置管理员', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试设置管理员', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetGroupAdmin, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      enable: true,
    });

    Assertions.assertSuccess(response, 'set_group_admin');

    await new Promise(resolve => setTimeout(resolve, 2000));

    const memberInfo = await primaryClient.call(ActionName.GetGroupMemberInfo, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      no_cache: true,
    });

    Assertions.assertSuccess(memberInfo, 'get_group_member_info');
    Assertions.assertEqual(memberInfo.data.role, 'admin', 'User should be admin');
  }, 30000);

  it('测试取消管理员', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetGroupAdmin, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      enable: false,
    });

    Assertions.assertSuccess(response, 'set_group_admin');

    await new Promise(resolve => setTimeout(resolve, 2000));
    // 账号2发条消息刷新状态
    const secondaryClient = context.twoAccountTest.getClient('secondary');
    await secondaryClient.call(ActionName.SendGroupMsg, {
      group_id: context.testGroupId,
      message: '刷新状态',
    });

    const memberInfo = await secondaryClient.call(ActionName.GetGroupMemberInfo, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      no_cache: true,
    });


    Assertions.assertSuccess(memberInfo, 'get_group_member_info');
    Assertions.assertEqual(memberInfo.data.role, 'member', 'User should be normal member');
  }, 30000);
});
