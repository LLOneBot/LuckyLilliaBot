/**
 * ocr_image 接口测试
 * 测试图片 OCR 识别功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llonebot/onebot11/types';
import { MediaPaths } from '../media';

describe('ocr_image - 图片 OCR 识别', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试 OCR 识别图片', async () => {
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

    // 测试 OCR
    const ocrResponse = await context.accountManager.getSecondary().call(ActionName.GoCQHTTP_OCRImage, {
      image: imageMsg.data.file
    });

    Assertions.assertSuccess(ocrResponse, 'ocr_image');
    Assertions.assertResponseHasFields(ocrResponse, ['texts', 'language']);
  }, 180000);
});
