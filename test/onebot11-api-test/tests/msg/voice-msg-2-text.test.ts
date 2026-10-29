import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llbot/plugin/internal/adapter/onebot11/types';
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

    const event = await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'group',
      message_id: sendResponse.data.message_id,
    }, (event) => {
      const messages = Array.isArray(event.message) ? event.message : [];
      return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Record);
    }, 150000);

    const messages = Array.isArray(event.message) ? event.message : [];
    const recordMsg = messages.find((msg: OB11MessageData) => msg.type === OB11MessageDataType.Record);

    if (!recordMsg || !recordMsg.data.file) {
      throw new Error('未找到语音消息');
    }

    const textResponse = await context.accountManager.getSecondary().call(ActionName.VoiceMsg2Text, {
      message_id: event.message_id
    });

    Assertions.assertSuccess(textResponse, 'voice_msg_2_text');
    Assertions.assertResponseHasFields(textResponse, ['text']);
  }, 18000);
});
