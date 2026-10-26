/** 需要管理员权限 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';

describe('set_group_ban - 群组单人禁言', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试禁言群成员', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const banResponse = await primaryClient.call(ActionName.SetGroupBan, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      duration: 60,
    });

    Assertions.assertSuccess(banResponse, 'set_group_ban');

    await new Promise(resolve => setTimeout(resolve, 2000));

    const memberInfo = await primaryClient.call(ActionName.GetGroupMemberInfo, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      no_cache: true,
    });

    Assertions.assertSuccess(memberInfo, 'get_group_member_info');
    if (memberInfo.data.shut_up_timestamp) {
      Assertions.assertTrue(
        memberInfo.data.shut_up_timestamp > Math.floor(Date.now() / 1000),
        'User should be banned'
      );
    }
  }, 30000);

  it('测试解除禁言', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const unbanResponse = await primaryClient.call(ActionName.SetGroupBan, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      duration: 0,
    });

    Assertions.assertSuccess(unbanResponse, 'set_group_ban');

    await new Promise(resolve => setTimeout(resolve, 2000));

    const memberInfo = await primaryClient.call(ActionName.GetGroupMemberInfo, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      no_cache: true,
    });

    Assertions.assertSuccess(memberInfo, 'get_group_member_info');
    if (memberInfo.data.shut_up_timestamp) {
      Assertions.assertTrue(
        memberInfo.data.shut_up_timestamp <= Math.floor(Date.now() / 1000),
        'User should not be banned'
      );
    }
  }, 30000);
});
