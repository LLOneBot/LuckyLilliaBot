/**
 * set_online_status 接口测试
 * 测试设置在线状态功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_online_status - 设置在线状态', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试设置在线状态', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetOnlineStatus, {
      status: 10, // 在线
      ext_status: 0,
      battery_status: 0
    });

    Assertions.assertSuccess(response, 'set_online_status');
  }, 30000);
});
