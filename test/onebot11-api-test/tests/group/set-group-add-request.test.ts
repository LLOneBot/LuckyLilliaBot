/** 需要管理员权限, 还要有真实的加群请求 (flag 来自事件) */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';

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

    const testFlag = 'test_flag_from_event';

    const response = await primaryClient.call(ActionName.SetGroupAddRequest, {
      flag: testFlag,
      approve: true,
    });

    Assertions.assertSuccess(response, 'set_group_add_request');
  }, 30000);

  it('测试拒绝加群请求', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const testFlag = 'test_flag_from_event';

    const response = await primaryClient.call(ActionName.SetGroupAddRequest, {
      flag: testFlag,
      approve: false,
      reason: '测试拒绝',
    });

    Assertions.assertSuccess(response, 'set_group_add_request');
  }, 30000);
});
