/**
 * reshare_flash_file 接口测试
 * 把已有 fileSet 重新分享一份（创建新的 share_link）
 */
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { MediaPaths } from '@/tests/media';

describe('reshare_flash_file - 重新分享闪传文件', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试 reshare：先 upload_flash_file 拿一个 fileSetId，再 reshare', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 1. 上传一个文件拿 fileSetId（小文件容易命中秒传）
    const upload = await primaryClient.call(ActionName.UploadFlashFile, {
      title: 'reshare-test',
      paths: [MediaPaths.getPath('test_ocr.png')],
    });
    if (upload.retcode !== 0) {
      console.log('upload_flash_file 失败（预期：非秒传 prep 被服务端阻止），跳过 reshare');
      return;
    }
    const fileSetId = upload.data.file_set_id;

    // 2. 用拿到的 fileSetId reshare
    const response = await primaryClient.call(ActionName.ReShareFlashFile, {
      file_set_id: fileSetId,
    });
    Assertions.assertSuccess(response, 'reshare_flash_file');
    Assertions.assertResponseHasFields(response, ['file_set_id', 'share_link', 'expire_time']);
  }, 60000);
});
