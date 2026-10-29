import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llbot/plugin/internal/adapter/onebot11/types';

describe('get_msg - 获取消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取群消息', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    const testMessage: OB11MessageData[] = [{
      type: OB11MessageDataType.Text,
      data: {
        text: `Test get_msg ${Date.now()}`
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

    const getResponse = await primaryClient.call(ActionName.GetMsg, {
      message_id: messageId
    });

    Assertions.assertSuccess(getResponse, 'get_msg');
    Assertions.assertResponseHasFields(getResponse, ['message_id', 'message']);
    Assertions.assertEqual(getResponse.data.message_id, messageId, '消息 ID 应该匹配');
  }, 60000);
});
