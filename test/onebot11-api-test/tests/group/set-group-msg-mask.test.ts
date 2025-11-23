/**
 * set_group_msg_mask 接口测试
 * 测试设置群消息屏蔽功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_group_msg_mask - 设置群消息屏蔽', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试屏蔽群消息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetGroupMsgMask, {
      group_id: context.testGroupId,
      mask: 3
    });

    Assertions.assertSuccess(response, 'set_group_msg_mask');
  }, 30000);

  it('测试取消屏蔽群消息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetGroupMsgMask, {
      group_id: context.testGroupId,
      mask: 2
    });

    Assertions.assertSuccess(response, 'set_group_msg_mask');
  }, 30000);
});
