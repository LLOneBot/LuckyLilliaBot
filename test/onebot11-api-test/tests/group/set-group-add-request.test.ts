/**
 * set_group_add_request 接口测试
 * 测试处理加群请求功能
 * 
 * 注意: 需要管理员权限
 * 注意: 此测试需要有实际的加群请求才能执行
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe.skip('set_group_add_request - 处理加群请求', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试同意加群请求', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 注意: 需要有实际的加群请求，flag 需要从实际事件中获取
    const testFlag = 'test_flag_from_event';

    const response = await primaryClient.call(ActionName.SetGroupAddRequest, {
      flag: testFlag,
      approve: true,
    });

    Assertions.assertSuccess(response, 'set_group_add_request');
  }, 30000);

  it('测试拒绝加群请求', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 注意: 需要有实际的加群请求，flag 需要从实际事件中获取
    const testFlag = 'test_flag_from_event';

    const response = await primaryClient.call(ActionName.SetGroupAddRequest, {
      flag: testFlag,
      approve: false,
      reason: '测试拒绝',
    });

    Assertions.assertSuccess(response, 'set_group_add_request');
  }, 30000);
});
