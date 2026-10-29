import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llbot/plugin/internal/adapter/onebot11/types';

describe('get_forward_msg - 获取合并转发消息内容', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取合并转发消息内容', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    const forwardMessages = [
      {
        type: 'node',
        data: {
          name: '测试用户',
          uin: context.primaryUserId,
          content: [
            {
              type: OB11MessageDataType.Text,
              data: { text: '合并转发内容测试' }
            }
          ]
        }
      }
    ];

    const sendResponse = await primaryClient.call(ActionName.GoCQHTTP_SendGroupForwardMsg, {
      group_id: context.testGroupId,
      messages: forwardMessages
    });

    Assertions.assertSuccess(sendResponse, 'send_group_forward_msg');

    const event = await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'group',
      message_id: sendResponse.data.message_id,
    }, (event) => {
      const messages = Array.isArray(event.message) ? event.message : [];
      return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Forward);
    }, 60000);

    const messages = Array.isArray(event.message) ? event.message : [];
    const forwardMsg = messages.find((msg: OB11MessageData) => msg.type === OB11MessageDataType.Forward);

    if (!forwardMsg || !forwardMsg.data.id) {
      throw new Error('未找到合并转发消息');
    }

    // 同 gocq: message_id 传 send 返回的 forward_id (resId), 不是消息 shortId
    const getResponse = await primaryClient.call(ActionName.GoCQHTTP_GetForwardMsg, {
      message_id: sendResponse.data.forward_id
    });

    Assertions.assertSuccess(getResponse, 'get_forward_msg');
    Assertions.assertResponseHasFields(getResponse, ['messages']);
    Assertions.assertDefined(getResponse.data.messages, '转发消息列表应该被定义');
  }, 120000);
});
