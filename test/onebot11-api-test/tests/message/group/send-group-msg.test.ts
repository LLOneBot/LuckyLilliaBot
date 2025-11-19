/**
 * send_group_msg 接口测试
 * 测试发送群消息功能
 *
 * 需求: 6.1
 */

import { OB11MessageEvent } from '@llonebot/onebot11/event';
import { OB11MessageText, OB11MessageDataType } from '@llonebot/onebot11/types';
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { Assert } from 'assert';

describe('send_group_msg - 发送群消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试发送群文本消息', async () => {
    if (!context.testGroupId) {
      console.log('Skipping test: No test group available');
      return;
    }

    const testMessage: OB11MessageText[] = 
    [{
        type: OB11MessageDataType.Text,
        data: {
            text: `Test group message ${Date.now()}`
        }
        
    }];
    const primaryClient = context.twoAccountTest.getClient('primary');
    const secondaryClient = context.twoAccountTest.getClient('secondary')

    const sendResponse = await primaryClient.call('send_group_msg', {
      group_id: context.testGroupId,
      message: testMessage,
    });
    Assertions.assertSuccess(sendResponse, 'send_group_msg');
    Assertions.assertDefined(sendResponse.data.message_id, 'Message ID should be defined');
    Assertions.assertResponseHasFields(sendResponse, ['message_id']);

    const event: OB11MessageEvent = await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'group',
        sub_type: 'normal',
        group_id: Number(context.testGroupId),
        user_id: Number(context.primaryUserId),
    }, 3000);
    Assertions.assertEqual(event.message, teardownMessageTest, '未收到发送的消息')
  }, 60000)
  it('发送 CQ 码', async () => {
    if (!context.testGroupId) {
      console.log('Skipping test: No test group available');
      return;
    }
  
    const testMessage = `[CQ:face,id=178] Test with emoji ${Date.now()}`;
    const primaryClient = context.twoAccountTest.getClient('primary');
  
    const sendResponse = await primaryClient.call('send_group_msg', {
      group_id: context.testGroupId,
      message: testMessage,
    });
  
    Assertions.assertSuccess(sendResponse, 'send_group_msg');
    Assertions.assertDefined(sendResponse.data.message_id);
  }, 60000);

});
