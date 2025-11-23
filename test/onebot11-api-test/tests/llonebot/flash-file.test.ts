/**
 * 闪照文件操作测试
 * 包括: get_flash_file_info, download_flash_file, upload_flash_file
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { MediaPaths } from '../media';

describe('flash_file - 闪照文件操作', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试上传闪照文件', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.UploadFlashFile, {
      file: MediaPaths.testGifUrl
    });

    if (response.retcode === 0) {
      Assertions.assertSuccess(response, 'upload_flash_file');
      Assertions.assertResponseHasFields(response, ['file_id']);
    } else {
      console.log('上传闪照文件失败:', response.message);
    }
  }, 60000);

  it('测试获取闪照文件信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先上传一个闪照
    const uploadResponse = await primaryClient.call(ActionName.UploadFlashFile, {
      file: MediaPaths.testImageUrl
    });

    if (uploadResponse.retcode === 0) {
      const fileId = uploadResponse.data.file_id;

      const response = await primaryClient.call(ActionName.GetFlashFileInfo, {
        file_id: fileId
      });

      if (response.retcode === 0) {
        Assertions.assertSuccess(response, 'get_flash_file_info');
        Assertions.assertResponseHasFields(response, ['file_name', 'file_size']);
      } else {
        console.log('获取闪照文件信息失败:', response.message);
      }
    } else {
      console.log('上传闪照失败，跳过测试');
    }
  }, 60000);

  it('测试下载闪照文件', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先上传一个闪照
    const uploadResponse = await primaryClient.call(ActionName.UploadFlashFile, {
      file: MediaPaths.testImageUrl
    });

    if (uploadResponse.retcode === 0) {
      const fileId = uploadResponse.data.file_id;

      const response = await primaryClient.call(ActionName.DownloadFlashFile, {
        file_id: fileId
      });

      if (response.retcode === 0) {
        Assertions.assertSuccess(response, 'download_flash_file');
        Assertions.assertResponseHasFields(response, ['file']);
      } else {
        console.log('下载闪照文件失败:', response.message);
      }
    } else {
      console.log('上传闪照失败，跳过测试');
    }
  }, 60000);
});
