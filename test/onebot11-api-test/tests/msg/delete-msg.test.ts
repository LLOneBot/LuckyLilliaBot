/**
 * delete_msg 接口测试
 * 测试撤回消息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llonebot/onebot11/types';

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

    // 先发送一条消息
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

    // 等待消息被接收
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_id: messageId,
    });

    // 等待一小段时间再撤回
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 撤回消息
    const deleteResponse = await primaryClient.call(ActionName.DeleteMsg, {
      message_id: messageId
    });

    Assertions.assertSuccess(deleteResponse, 'delete_msg');

    // 等待撤回通知
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'notice',
      notice_type: 'group_recall',
      message_id: messageId,
    }, undefined, 10000);
  }, 60000);
});
