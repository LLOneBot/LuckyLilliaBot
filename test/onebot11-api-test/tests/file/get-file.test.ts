import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llbot/plugin/internal/adapter/onebot11/types';
import { MediaPaths } from '../media';

describe('get_file - 获取文件信息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取图片文件信息', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    const testMessage: OB11MessageData[] = [
      {
        type: OB11MessageDataType.Image,
        data: {
          file: MediaPaths.testGifUrl
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
      return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Image);
    }, 150000);

    const messages = Array.isArray(event.message) ? event.message : [];
    const imageMsg = messages.find((msg: OB11MessageData) => msg.type === OB11MessageDataType.Image);

    if (!imageMsg || !imageMsg.data.file) {
      throw new Error('未找到图片消息');
    }

    // file ID 来自接收方, 用接收方账号查
    const secondaryClient = context.twoAccountTest.getClient('secondary');
    const fileResponse = await secondaryClient.call(ActionName.GetFile, {
      file: imageMsg.data.file
    });

    Assertions.assertSuccess(fileResponse, 'get_file');
    Assertions.assertResponseHasFields(fileResponse, ['file', 'file_size', 'file_name']);
  }, 180000);
});
