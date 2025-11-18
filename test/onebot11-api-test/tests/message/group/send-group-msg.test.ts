/**
 * send_group_msg 接口测试
 * 测试发送群消息功能
 *
 * 需求: 6.1
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions'
import { EventListener } from '@/core/EventListener';

describe('send_group_msg - 发送群消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();

    // 如果配置中没有提供 test_group_id，尝试从 API 获取
    if (!context.testGroupId) {
      const primaryClient = context.twoAccountTest.getClient('primary');
      const groupListResponse = await primaryClient.call('get_group_list', {});

      if (groupListResponse.retcode === 0 && groupListResponse.data.length > 0) {
        context.testGroupId = String(groupListResponse.data[0].group_id);
      }
    }
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试发送群文本消息', async () => {
    if (!context.testGroupId) {
      console.log('Skipping test: No test group available');
      return;
    }

    const testMessage = `Test group message ${Date.now()}`;
    const primaryClient = context.twoAccountTest.getClient('primary');
    const secondaryClient = context.twoAccountTest.getClient('secondary')

    const sendResponse = await primaryClient.call('send_group_msg', {
      group_id: context.testGroupId,
      message: testMessage,
    });
    Assertions.assertSuccess(sendResponse, 'send_group_msg');
    Assertions.assertDefined(sendResponse.data.message_id, 'Message ID should be defined');
    Assertions.assertResponseHasFields(sendResponse, ['message_id']);
  }, 60000);
  it('账号2等待消息', async () => {
    const event = await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'group',
        sub_type: 'normal',
        group_id: Number(context.testGroupId),
        user_id: Number(context.primaryUserId),
    }, 3000);
  })
  // it('发送 CQ 码', async () => {
  //   if (!context.testGroupId) {
  //     console.log('Skipping test: No test group available');
  //     return;
  //   }
  //
  //   const testMessage = `[CQ:face,id=178] Test with emoji ${Date.now()}`;
  //   const primaryClient = context.twoAccountTest.getClient('primary');
  //
  //   const sendResponse = await primaryClient.call('send_group_msg', {
  //     group_id: context.testGroupId,
  //     message: testMessage,
  //   });
  //
  //   Assertions.assertSuccess(sendResponse, 'send_group_msg');
  //   Assertions.assertDefined(sendResponse.data.message_id);
  // }, 60000);

  // it('发送错误群号', async () => {
  //   const primaryClient = context.twoAccountTest.getClient('primary');
  //   const invalidGroupId = '999999999999';
  //
  //   const sendResponse = await primaryClient.call('send_group_msg', {
  //     group_id: invalidGroupId,
  //     message: 'Test message',
  //   });
  //
  //   Assertions.assertFailure(sendResponse, undefined, 'send_group_msg');
  // }, 60000);
});
