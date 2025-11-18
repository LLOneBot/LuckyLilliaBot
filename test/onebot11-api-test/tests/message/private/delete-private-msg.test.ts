/**
 * delete_msg 接口测试 - 私聊消息撤回
 * 测试撤回私聊消息功能
 * 
 * 需求: 6.1
 */

import { setupMessageTest, teardownMessageTest, sleep, MessageTestContext } from '../setup.js';
import { Assertions } from '../../../utils/Assertions.js';

describe('delete_msg - 撤回私聊消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('should delete sent private message', async () => {
    const testMessage = `Test delete message ${Date.now()}`;
    const primaryClient = context.twoAccountTest.getClient('primary');

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    const messageId = sendResponse.data.message_id;

    // 等待消息发送完成
    await sleep(1000);

    const deleteResponse = await primaryClient.call('delete_msg', {
      message_id: messageId,
    });

    Assertions.assertSuccess(deleteResponse, 'delete_msg');
  }, 60000);

  it('should handle invalid message ID', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const invalidMessageId = '999999999999';

    const deleteResponse = await primaryClient.call('delete_msg', {
      message_id: invalidMessageId,
    });

    Assertions.assertFailure(deleteResponse, undefined, 'delete_msg');
  }, 60000);
});
