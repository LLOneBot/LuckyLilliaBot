/**
 * send_msg 接口测试 - 通用发送消息接口
 * 测试通用消息发送功能（支持私聊和群聊）
 * 
 * 需求: 6.1
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup.js';
import { Assertions } from '../../../utils/Assertions.js';

describe('send_msg - 通用发送消息接口', () => {
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

  describe('Private Message via send_msg', () => {
    it('should send private message using send_msg', async () => {
      const testMessage = `Test send_msg private ${Date.now()}`;
      const primaryClient = context.twoAccountTest.getClient('primary');

      const sendResponse = await primaryClient.call('send_msg', {
        message_type: 'private',
        user_id: context.secondaryUserId,
        message: testMessage,
      });

      Assertions.assertSuccess(sendResponse, 'send_msg');
      Assertions.assertDefined(sendResponse.data.message_id);
      Assertions.assertResponseHasFields(sendResponse, ['message_id']);
    }, 60000);

    it('should send private message with auto_escape parameter', async () => {
      const testMessage = `Test send_msg with auto_escape ${Date.now()}`;
      const primaryClient = context.twoAccountTest.getClient('primary');

      const sendResponse = await primaryClient.call('send_msg', {
        message_type: 'private',
        user_id: context.secondaryUserId,
        message: testMessage,
        auto_escape: false,
      });

      Assertions.assertSuccess(sendResponse, 'send_msg');
      Assertions.assertDefined(sendResponse.data.message_id);
    }, 60000);
  });

  describe('Group Message via send_msg', () => {
    it('should send group message using send_msg', async () => {
      if (!context.testGroupId) {
        console.log('Skipping test: No test group available');
        return;
      }

      const testMessage = `Test send_msg group ${Date.now()}`;
      const primaryClient = context.twoAccountTest.getClient('primary');

      const sendResponse = await primaryClient.call('send_msg', {
        message_type: 'group',
        group_id: context.testGroupId,
        message: testMessage,
      });

      Assertions.assertSuccess(sendResponse, 'send_msg');
      Assertions.assertDefined(sendResponse.data.message_id);
    }, 60000);

    it('should send group message with CQ code using send_msg', async () => {
      if (!context.testGroupId) {
        console.log('Skipping test: No test group available');
        return;
      }

      const testMessage = `[CQ:at,qq=all] Test send_msg with CQ ${Date.now()}`;
      const primaryClient = context.twoAccountTest.getClient('primary');

      const sendResponse = await primaryClient.call('send_msg', {
        message_type: 'group',
        group_id: context.testGroupId,
        message: testMessage,
      });

      Assertions.assertSuccess(sendResponse, 'send_msg');
      Assertions.assertDefined(sendResponse.data.message_id);
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should fail when message_type is missing', async () => {
      const primaryClient = context.twoAccountTest.getClient('primary');

      const sendResponse = await primaryClient.call('send_msg', {
        user_id: context.secondaryUserId,
        message: 'Test message',
      });

      Assertions.assertFailure(sendResponse, undefined, 'send_msg');
    }, 60000);

    it('should fail when required parameters are missing', async () => {
      const primaryClient = context.twoAccountTest.getClient('primary');

      const sendResponse = await primaryClient.call('send_msg', {
        message_type: 'private',
        message: 'Test message',
      });

      Assertions.assertFailure(sendResponse, undefined, 'send_msg');
    }, 60000);

    it('should fail with invalid user_id', async () => {
      const primaryClient = context.twoAccountTest.getClient('primary');
      const invalidUserId = '999999999999';

      const sendResponse = await primaryClient.call('send_msg', {
        message_type: 'private',
        user_id: invalidUserId,
        message: 'Test message',
      });

      Assertions.assertFailure(sendResponse, undefined, 'send_msg');
    }, 60000);

    it('should fail with invalid group_id', async () => {
      const primaryClient = context.twoAccountTest.getClient('primary');
      const invalidGroupId = '999999999999';

      const sendResponse = await primaryClient.call('send_msg', {
        message_type: 'group',
        group_id: invalidGroupId,
        message: 'Test message',
      });

      Assertions.assertFailure(sendResponse, undefined, 'send_msg');
    }, 60000);
  });
});
