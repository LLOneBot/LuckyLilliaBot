import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llbot/onebot11/types';

describe('mark_msg_as_read - 标记消息已读', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试标记群消息已读', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    const testMessage: OB11MessageData[] = [{
      type: OB11MessageDataType.Text,
      data: {
        text: `Test mark as read ${Date.now()}`
      }
    }];

    const sendResponse = await primaryClient.call(ActionName.SendGroupMsg, {
      group_id: context.testGroupId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_group_msg');

    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_id: sendResponse.data.message_id,
    });

    const secondaryClient = context.twoAccountTest.getClient('secondary');
    const markResponse = await secondaryClient.call(ActionName.GoCQHTTP_MarkMsgAsRead, {
      message_id: sendResponse.data.message_id
    });

    Assertions.assertSuccess(markResponse, 'mark_msg_as_read');
  }, 60000);
});
