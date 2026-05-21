/**
 * ocr_image 接口测试
 * 测试图片 OCR 识别功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { MediaPaths } from '@/tests/media';

describe('ocr_image - 图片 OCR 识别', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试 OCR 识别图片', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const ocrResponse = await primaryClient.call(ActionName.GoCQHTTP_OCRImage, {
      image: MediaPaths.getPath('test_ocr.png'),
    });

    Assertions.assertSuccess(ocrResponse, 'ocr_image');
    Assertions.assertResponseHasFields(ocrResponse, ['texts', 'language']);
    Assertions.assertTrue(ocrResponse.data.texts.length > 0, 'should detect at least one text region');
  }, 30000);
});
