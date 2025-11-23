/**
 * voice_msg_2_text 接口测试
 * 测试语音转文字功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llonebot/onebot11/types';
import { MediaPaths } from '../media';

describe('voice_msg_2_text - 语音转文字', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试语音转文字', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先发送一条语音消息
    const testMessage: OB11MessageData[] = [
      {
        type: OB11MessageDataType.Record,
        data: {
          file: MediaPaths.testAudio2Url
        }
      }
    ];

    const sendResponse = await primaryClient.call(ActionName.SendGroupMsg, {
      group_id: context.testGroupId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_group_msg');

    // 等待消息被接收
    const event = await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'group',
      message_id: sendResponse.data.message_id,
    }, (event) => {
      const messages = Array.isArray(event.message) ? event.message : [];
      return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Record);
    }, 150000);

    // 获取语音的 file ID
    const messages = Array.isArray(event.message) ? event.message : [];
    const recordMsg = messages.find((msg: OB11MessageData) => msg.type === OB11MessageDataType.Record);

    if (!recordMsg || !recordMsg.data.file) {
      throw new Error('未找到语音消息');
    }

    // 语音转文字
    const textResponse = await context.accountManager.getSecondary().call(ActionName.VoiceMsg2Text, {
      message_id: event.message_id
    });

    Assertions.assertSuccess(textResponse, 'voice_msg_2_text');
    Assertions.assertResponseHasFields(textResponse, ['text']);
  }, 18000);
});
