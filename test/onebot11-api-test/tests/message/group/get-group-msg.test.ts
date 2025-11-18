/**
 * get_msg 接口测试 - 获取群消息
 * 测试获取群消息功能
 * 
 * 需求: 6.1
 */

import { setupMessageTest, teardownMessageTest, sleep, MessageTestContext } from '../setup.js';
import { Assertions } from '../../../utils/Assertions.js';

describe('get_msg - 获取群消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();

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

  it('should get sent group message', async () => {
    if (!context.testGroupId) {
      console.log('Skipping test: No test group available');
      return;
    }

    const testMessage = `Test get group message ${Date.now()}`;
    const primaryClient = context.twoAccountTest.getClient('primary');

    const sendResponse = await primaryClient.call('send_group_msg', {
      group_id: context.testGroupId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_group_msg');
    const messageId = sendResponse.data.message_id;

    // 等待消息保存
    await sleep(1000);

    const getResponse = await primaryClient.call('get_msg', {
      message_id: messageId,
    });

    Assertions.assertSuccess(getResponse, 'get_msg');
    Assertions.assertDefined(getResponse.data, 'Message data should be defined');
    Assertions.assertResponseHasFields(getResponse, ['message_id', 'message']);
    Assertions.assertEqual(
      String(getResponse.data.message_id),
      String(messageId),
      'Message ID should match'
    );
  }, 60000);
});
