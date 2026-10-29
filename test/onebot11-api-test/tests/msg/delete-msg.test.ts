import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llbot/plugin/internal/adapter/onebot11/types';

describe('delete_msg - 撤回消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试撤回群消息', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    const testMessage: OB11MessageData[] = [{
      type: OB11MessageDataType.Text,
      data: {
        text: `Test delete_msg ${Date.now()}`
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

    await new Promise(resolve => setTimeout(resolve, 1000));

    const deleteResponse = await primaryClient.call(ActionName.DeleteMsg, {
      message_id: messageId
    });

    Assertions.assertSuccess(deleteResponse, 'delete_msg');

    // 群撤回 server 广播给所有人 (0x2DC sub=17), 撤回方和接收方都要收到
    await Promise.all([
      context.twoAccountTest.primaryListener.waitForEvent({
        post_type: 'notice',
        notice_type: 'group_recall',
        message_id: messageId,
      }, undefined, 10000),
      context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'notice',
        notice_type: 'group_recall',
        message_id: messageId,
      }, undefined, 10000),
    ]);
  }, 60000);
});
