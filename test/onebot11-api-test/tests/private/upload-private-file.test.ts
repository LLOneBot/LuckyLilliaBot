/**
 * upload_private_file 接口测试
 * 测试上传私聊文件功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('upload_private_file - 上传私聊文件', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试上传私聊文件', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 创建一个测试文件内容
    const testContent = Buffer.from('Test private file content').toString('base64');

    const response = await primaryClient.call(ActionName.GoCQHTTP_UploadPrivateFile, {
      user_id: context.secondaryUserId,
      file: `base64://${testContent}`,
      name: 'test-private-file.txt'
    });

    Assertions.assertSuccess(response, 'upload_private_file');
  }, 60000);
});
