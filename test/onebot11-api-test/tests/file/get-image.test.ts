/**
 * get_image 接口测试
 * 测试获取图片信息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llonebot/onebot11/types';
import { MediaPaths } from '../media';

describe('get_image - 获取图片信息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取图片信息', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先发送一张图片
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

    // 等待消息被接收
    const event = await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'group',
      message_id: sendResponse.data.message_id,
    }, (event) => {
      const messages = Array.isArray(event.message) ? event.message : [];
      return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Image);
    }, 150000);

    // 获取图片的 file ID
    const messages = Array.isArray(event.message) ? event.message : [];
    const imageMsg = messages.find((msg: OB11MessageData) => msg.type === OB11MessageDataType.Image);
    
    if (!imageMsg || !imageMsg.data.file) {
      throw new Error('未找到图片消息');
    }

    // 测试 get_image
    const imageResponse = await primaryClient.call(ActionName.GetImage, {
      file: imageMsg.data.file
    });

    Assertions.assertSuccess(imageResponse, 'get_image');
    Assertions.assertResponseHasFields(imageResponse, ['file']);
  }, 180000);
});
