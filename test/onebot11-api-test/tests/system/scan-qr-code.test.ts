/**
 * scan_qr_code 接口测试
 * 用 QQ 的扫码功能识别图片里的二维码
 */
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { MediaPaths } from '@/tests/media';

describe('scan_qr_code - 扫描二维码', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试扫描二维码（payload = "https://example.com/test-qr-payload"）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const response = await primaryClient.call(ActionName.ScanQRCode, {
      file: MediaPaths.getPath('test_qr.png'),
    });
    Assertions.assertSuccess(response, 'scan_qr_code');
    Assertions.assertTrue(Array.isArray(response.data), 'response.data should be array');
    Assertions.assertTrue(response.data.length > 0, 'should detect at least one QR');
    Assertions.assertTrue(
      response.data.some((r: any) => r.text === 'https://example.com/test-qr-payload'),
      'decoded text should match the source payload'
    );
  }, 30000);
});
