/**
 * get_msg 接口测试 - 获取私聊消息
 * 测试获取私聊消息功能
 * 
 * 需求: 6.1
 */

import { setupMessageTest, teardownMessageTest, sleep, MessageTestContext } from '../setup.js';
import { Assertions } from '../../../utils/Assertions.js';

describe('get_msg - 获取私聊消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('should get sent private message', async () => {
    const testMessage = `Test get message ${Date.now()}`;
    const primaryClient = context.twoAccountTest.getClient('primary');

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
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

  it('should handle invalid message ID', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const invalidMessageId = '999999999999';

    const getResponse = await primaryClient.call('get_msg', {
      message_id: invalidMessageId,
    });

    Assertions.assertFailure(getResponse, undefined, 'get_msg');
  }, 60000);
});
