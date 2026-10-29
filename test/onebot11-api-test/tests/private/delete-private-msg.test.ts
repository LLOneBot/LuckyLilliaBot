import { setupMessageTest, teardownMessageTest, sleep, MessageTestContext } from '../setup';
import { Assertions } from '../../utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';

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

    const sendResponse = await primaryClient.call(ActionName.SendPrivateMsg, {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    const messageId = sendResponse.data.message_id;

    await sleep(1000);

    const deleteResponse = await primaryClient.call(ActionName.DeleteMsg, {
      message_id: messageId,
    });

    Assertions.assertSuccess(deleteResponse, 'delete_msg');
  }, 60000);

  it('should handle invalid message ID', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const invalidMessageId = '999999999999';

    const deleteResponse = await primaryClient.call(ActionName.DeleteMsg, {
      message_id: invalidMessageId,
    });

    Assertions.assertFailure(deleteResponse, undefined, 'delete_msg');
  }, 60000);
});
