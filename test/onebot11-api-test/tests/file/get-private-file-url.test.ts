import { setupMessageTest, teardownMessageTest, MessageTestContext, sleep } from '../setup'
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { MediaPaths } from '@/tests/media'

describe('get_private_file_url - 获取私聊文件 URL', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试上传私聊文件并获取 URL', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');
    const secondaryClient = context.twoAccountTest.getClient('secondary');

    const fileName = `test-private-file-${Date.now()}.txt`;

    const uploadResponse = await primaryClient.call(ActionName.GoCQHTTP_UploadPrivateFile, {
      user_id: context.secondaryUserId,
      file: MediaPaths.testVideoUrl,
      name: fileName
    });

    Assertions.assertSuccess(uploadResponse, 'upload_private_file');

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
    if (!fileId) {
      throw new Error('无法获取 file_id，测试失败');
    }
    const urlResponse = await secondaryClient.call(ActionName.GetPrivateFileUrl, {
      file_id: fileId
    });

    Assertions.assertSuccess(urlResponse, 'get_private_file_url');
    Assertions.assertResponseHasFields(urlResponse, ['url']);

    if (urlResponse.data && urlResponse.data.url) {
      console.log('✓ 获取到私聊文件 URL:', urlResponse.data.url);
    }
  }, 120000);
});
