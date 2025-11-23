/**
 * get_msg 接口测试
 * 测试获取消息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llonebot/onebot11/types';

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

    // 先发送一条消息
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

    // 等待消息被接收
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_id: messageId,
    });

    // 获取消息
    const getResponse = await primaryClient.call(ActionName.GetMsg, {
      message_id: messageId
    });

    Assertions.assertSuccess(getResponse, 'get_msg');
    Assertions.assertResponseHasFields(getResponse, ['message_id', 'message']);
    Assertions.assertEqual(getResponse.data.message_id, messageId, '消息 ID 应该匹配');
  }, 60000);
});
