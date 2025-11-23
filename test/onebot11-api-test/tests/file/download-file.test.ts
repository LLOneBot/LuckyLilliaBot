/**
 * download_file 接口测试
 * 测试下载文件功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { MediaPaths } from '../media';

describe('download_file - 下载文件', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试通过 URL 下载文件', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_DownloadFile, {
      url: "https://inews.gtimg.com/newsapp_bt/0/15822141895/0",
      name: 'test-download.png'
    });

    Assertions.assertSuccess(response, 'download_file');
    Assertions.assertResponseHasFields(response, ['file']);
    Assertions.assertDefined(response.data.file, '文件路径应该被定义');
  }, 60000);

  it('测试通过 base64 下载文件', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 简单的 base64 测试数据
    const base64Data = 'base64://SGVsbG8gV29ybGQ='; // "Hello World"

    const response = await primaryClient.call(ActionName.GoCQHTTP_DownloadFile, {
      base64: base64Data,
      name: 'test-base64.txt'
    });

    Assertions.assertSuccess(response, 'download_file');
    Assertions.assertResponseHasFields(response, ['file']);
  }, 30000);
});
