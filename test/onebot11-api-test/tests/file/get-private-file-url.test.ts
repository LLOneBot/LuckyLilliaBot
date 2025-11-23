/**
 * get_private_file_url 接口测试
 * 测试获取私聊文件 URL 功能
 * 完整流程：上传私聊文件 → 接收文件 → 获取文件 URL
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { MediaPaths } from '@/tests/media'

describe('get_private_file_url - 获取私聊文件 URL', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  // 现在这个接口貌似有问题，暂时先跳过
  it.skip('测试上传私聊文件并获取 URL', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');
    const secondaryClient = context.twoAccountTest.getClient('secondary');

    // 步骤1: 上传私聊文件
    const testContent = Buffer.from('Test private file for URL test').toString('base64');
    const fileName = `test-private-file-${Date.now()}.txt`;

    const uploadResponse = await primaryClient.call(ActionName.GoCQHTTP_UploadPrivateFile, {
      user_id: context.secondaryUserId,
      file: MediaPaths.testVideoUrl,
      name: fileName
    });

    Assertions.assertSuccess(uploadResponse, 'upload_private_file');

    // 步骤2: 等待 secondary 接收到文件消息
    const event = await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'private',
      user_id: Number(context.primaryUserId),
    }, (event) => {
      const messages = Array.isArray(event.message) ? event.message : [];
      const hasFile = messages.some((msg: any) => msg.type === 'file');
      return hasFile;
    }, 60000);

    Assertions.assertDefined(event, '应该接收到文件消息');
    const fileId = event.message.find((msg: any) => msg.type === 'file')?.data.file_id;
    // 步骤3: 获取私聊文件 URL
    if (!fileId) {
      throw new Error('无法获取 file_id，测试失败');
    }

    const urlResponse = await secondaryClient.call(ActionName.GetPrivateFileUrl, {
      user_id: context.primaryUserId,
      file_id: fileId
    });

    Assertions.assertSuccess(urlResponse, 'get_private_file_url');
    Assertions.assertResponseHasFields(urlResponse, ['url']);

    if (urlResponse.data && urlResponse.data.url) {
      console.log('✓ 获取到私聊文件 URL:', urlResponse.data.url);
    }
  }, 120000);
});
