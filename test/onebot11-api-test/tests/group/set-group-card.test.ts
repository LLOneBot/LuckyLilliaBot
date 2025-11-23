/**
 * set_group_card 接口测试
 * 测试设置群名片功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_group_card - 设置群名片', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试设置群名片', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const newCard = `TestCard_${Date.now()}`;

    // 设置群名片
    const setResponse = await primaryClient.call(ActionName.SetGroupCard, {
      group_id: context.testGroupId,
      user_id: context.primaryUserId,
      card: newCard,
    });

    Assertions.assertSuccess(setResponse, 'set_group_card');

    // 等待一段时间让设置生效
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 验证群名片是否设置成功
    const getResponse = await primaryClient.call(ActionName.GetGroupMemberInfo, {
      group_id: context.testGroupId,
      user_id: context.primaryUserId,
      no_cache: true,
    });

    Assertions.assertSuccess(getResponse, 'get_group_member_info');
    Assertions.assertEqual(getResponse.data.card, newCard, 'Card should be updated');
  }, 30000);

  it('测试清空群名片', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 清空群名片
    const setResponse = await primaryClient.call(ActionName.SetGroupCard, {
      group_id: context.testGroupId,
      user_id: context.primaryUserId,
      card: '',
    });

    Assertions.assertSuccess(setResponse, 'set_group_card');

    // 等待一段时间让设置生效
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 验证群名片是否清空
    const getResponse = await primaryClient.call(ActionName.GetGroupMemberInfo, {
      group_id: context.testGroupId,
      user_id: context.primaryUserId,
      no_cache: true,
    });

    Assertions.assertSuccess(getResponse, 'get_group_member_info');
    Assertions.assertEqual(getResponse.data.card, '', 'Card should be empty');
  }, 30000);
});
