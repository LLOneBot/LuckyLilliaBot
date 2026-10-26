import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llbot/onebot11/types';

describe('forward_single_msg - 转发单条消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试转发群消息到群', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    const testMessage: OB11MessageData[] = [{
      type: OB11MessageDataType.Text,
      data: {
        text: `Test forward message ${Date.now()}`
      }
    }];

    const sendResponse = await primaryClient.call(ActionName.SendGroupMsg, {
      group_id: context.testGroupId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_group_msg');
    const messageId = sendResponse.data.message_id;

    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_id: messageId,
    });

    const forwardResponse = await primaryClient.call(ActionName.ForwardGroupSingleMsg, {
      group_id: context.testGroupId,
      message_id: messageId
    });

    Assertions.assertSuccess(forwardResponse, 'forward_group_single_msg');
    Assertions.assertResponseHasFields(forwardResponse, ['message_id']);

    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'group',
    }, undefined, 30000);
  }, 90000);

  it('测试转发私聊消息到好友', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    const testMessage: OB11MessageData[] = [{
      type: OB11MessageDataType.Text,
      data: {
        text: `Test forward private ${Date.now()}`
      }
    }];

    const sendResponse = await primaryClient.call(ActionName.SendPrivateMsg, {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    const messageId = sendResponse.data.message_id;

    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
    });

    const forwardResponse = await primaryClient.call(ActionName.ForwardFriendSingleMsg, {
      user_id: context.secondaryUserId,
      message_id: messageId
    });

    Assertions.assertSuccess(forwardResponse, 'forward_friend_single_msg');
    Assertions.assertResponseHasFields(forwardResponse, ['message_id']);

    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'private',
    }, undefined, 30000);
  }, 90000);
});
