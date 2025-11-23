/**
 * send_msg 接口测试
 * 测试通用发送消息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '../../../../src/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llonebot/onebot11/types';

describe('send_msg - 通用发送消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试发送群消息', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    const testMessage: OB11MessageData[] = [{
      type: OB11MessageDataType.Text,
      data: {
        text: `Test send_msg group ${Date.now()}`
      }
    }];

    const response = await primaryClient.call(ActionName.SendMsg, {
      message_type: 'group',
      group_id: context.testGroupId,
      message: testMessage,
    });

    Assertions.assertSuccess(response, 'send_msg');
    Assertions.assertResponseHasFields(response, ['message_id']);

    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'group',
      message_id: response.data.message_id,
    });
  }, 60000);

  it('测试发送私聊消息', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    const testMessage: OB11MessageData[] = [{
      type: OB11MessageDataType.Text,
      data: {
        text: `Test send_msg private ${Date.now()}`
      }
    }];

    const response = await primaryClient.call(ActionName.SendMsg, {
      message_type: 'private',
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(response, 'send_msg');
    Assertions.assertResponseHasFields(response, ['message_id']);

    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'private',
      message: testMessage,
    });
  }, 60000);
});
