/**
 * set_group_ban 接口测试
 * 测试群组单人禁言功能
 * 
 * 注意: 需要管理员权限
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

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

    // 禁言 60 秒
    const banResponse = await primaryClient.call(ActionName.SetGroupBan, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      duration: 60,
    });

    Assertions.assertSuccess(banResponse, 'set_group_ban');

    // 等待一段时间让设置生效
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 验证禁言状态
    const memberInfo = await primaryClient.call(ActionName.GetGroupMemberInfo, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      no_cache: true,
    });

    Assertions.assertSuccess(memberInfo, 'get_group_member_info');
    // 注意: shut_up_timestamp 应该大于当前时间
    if (memberInfo.data.shut_up_timestamp) {
      Assertions.assertTrue(
        memberInfo.data.shut_up_timestamp > Math.floor(Date.now() / 1000),
        'User should be banned'
      );
    }
  }, 30000);

  it('测试解除禁言', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 解除禁言 (duration = 0)
    const unbanResponse = await primaryClient.call(ActionName.SetGroupBan, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      duration: 0,
    });

    Assertions.assertSuccess(unbanResponse, 'set_group_ban');

    // 等待一段时间让设置生效
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 验证禁言已解除
    const memberInfo = await primaryClient.call(ActionName.GetGroupMemberInfo, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
      no_cache: true,
    });

    Assertions.assertSuccess(memberInfo, 'get_group_member_info');
    // shut_up_timestamp 应该为 0 或小于当前时间
    if (memberInfo.data.shut_up_timestamp) {
      Assertions.assertTrue(
        memberInfo.data.shut_up_timestamp <= Math.floor(Date.now() / 1000),
        'User should not be banned'
      );
    }
  }, 30000);
});
