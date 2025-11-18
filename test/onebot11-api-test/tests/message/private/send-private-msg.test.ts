/**
 * send_private_msg 接口测试
 * 测试发送私聊消息功能
 * 
 * 需求: 6.1
 */

import { setupMessageTest, teardownMessageTest, sleep, MessageTestContext } from '../setup.js';
import { Assertions } from '../../../utils/Assertions.js';

describe('send_private_msg - 发送私聊消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('should send private message from primary to secondary', async () => {
    const testMessage = `Test private message ${Date.now()}`;
    const primaryClient = context.twoAccountTest.getClient('primary');

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    Assertions.assertDefined(sendResponse.data.message_id, 'Message ID should be defined');
    Assertions.assertResponseHasFields(sendResponse, ['message_id']);
  }, 60000);

  it('should send private message from secondary to primary', async () => {
    const testMessage = `Test private message reverse ${Date.now()}`;
    const secondaryClient = context.twoAccountTest.getClient('secondary');

    const sendResponse = await secondaryClient.call('send_private_msg', {
      user_id: context.primaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    Assertions.assertDefined(sendResponse.data.message_id);
    Assertions.assertResponseHasFields(sendResponse, ['message_id']);
  }, 60000);

  it('should handle special characters in private message', async () => {
    const testMessage = `Special chars: !@#$%^&*()_+-=[]{}|;':",./<>? ${Date.now()}`;
    const primaryClient = context.twoAccountTest.getClient('primary');

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    Assertions.assertDefined(sendResponse.data.message_id);
  }, 60000);

  it('should handle empty message', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: '',
    });

    // 根据实现，可能成功或失败
    Assertions.assertDefined(sendResponse.retcode);
  }, 60000);

  it('should handle long message', async () => {
    const longMessage = `Long message test ${Date.now()}: ${'A'.repeat(500)}`;
    const primaryClient = context.twoAccountTest.getClient('primary');

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: longMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    Assertions.assertDefined(sendResponse.data.message_id);
  }, 60000);

  it('should handle message with newlines', async () => {
    const testMessage = `Multi-line message ${Date.now()}\nLine 2\nLine 3`;
    const primaryClient = context.twoAccountTest.getClient('primary');

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    Assertions.assertDefined(sendResponse.data.message_id);
  }, 60000);

  it('should fail with invalid user_id', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const invalidUserId = '999999999999';

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: invalidUserId,
      message: 'Test message',
    });

    Assertions.assertFailure(sendResponse, undefined, 'send_private_msg');
  }, 60000);
});
