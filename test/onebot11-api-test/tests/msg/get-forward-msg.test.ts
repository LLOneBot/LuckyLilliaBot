/**
 * get_forward_msg 接口测试
 * 测试获取合并转发消息内容功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llonebot/onebot11/types';

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

    // 先发送一条合并转发消息
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

    // 等待消息被接收
    const event = await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'group',
      message_id: sendResponse.data.message_id,
    }, (event) => {
      const messages = Array.isArray(event.message) ? event.message : [];
      return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Forward);
    }, 60000);

    // 获取转发消息的 ID
    const messages = Array.isArray(event.message) ? event.message : [];
    const forwardMsg = messages.find((msg: OB11MessageData) => msg.type === OB11MessageDataType.Forward);

    if (!forwardMsg || !forwardMsg.data.id) {
      throw new Error('未找到合并转发消息');
    }

    // 获取合并转发消息内容
    const getResponse = await primaryClient.call(ActionName.GoCQHTTP_GetForwardMsg, {
      message_id: sendResponse.data.message_id.toString()
    });

    Assertions.assertSuccess(getResponse, 'get_forward_msg');
    Assertions.assertResponseHasFields(getResponse, ['messages']);
    Assertions.assertDefined(getResponse.data.messages, '转发消息列表应该被定义');
  }, 120000);
});
