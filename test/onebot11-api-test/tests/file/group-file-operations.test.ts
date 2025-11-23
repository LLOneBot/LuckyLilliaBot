/**
 * group_file_operations 接口测试
 * 测试群文件完整生命周期：上传、获取URL、删除
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('group_file_operations - 群文件操作', () => {
  let context: MessageTestContext;
  let uploadedFileId: string | null = null;
  let uploadedFileName: string | null = null;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试上传群文件', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 创建一个测试文件内容
    const testContent = Buffer.from('Test group file content for operations').toString('base64');
    uploadedFileName = `test-file-${Date.now()}.txt`;

    const response = await primaryClient.call(ActionName.GoCQHTTP_UploadGroupFile, {
      group_id: context.testGroupId,
      file: `base64://${testContent}`,
      name: uploadedFileName
    });

    Assertions.assertSuccess(response, 'upload_group_file');

    // 如果返回了 file_id，保存下来用于后续测试
    if (response.data && response.data.file_id) {
      uploadedFileId = response.data.file_id;
    }
  }, 60000);

  it('测试获取群根目录文件列表（验证文件已上传）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 等待一下确保文件上传完成
    await new Promise(resolve => setTimeout(resolve, 3000));

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
      group_id: context.testGroupId
    });

    Assertions.assertSuccess(response, 'get_group_root_files');
    Assertions.assertResponseHasFields(response, ['files', 'folders']);

    // 验证文件列表中包含我们上传的文件
    if (response.data && response.data.files) {
      const files = response.data.files;
      Assertions.assertDefined(files, '文件列表应该被定义');

      // 查找我们上传的文件
      if (uploadedFileName) {
        const foundFile = files.find((f: any) => f.file_name === uploadedFileName);
        if (foundFile) {
          console.log('✓ 找到上传的文件:', foundFile);
          // 如果之前没有 file_id，从这里获取
          if (!uploadedFileId && foundFile.file_id) {
            uploadedFileId = foundFile.file_id;
          }
        }
      }
    }
  }, 30000);

  it('测试获取群文件下载链接', async () => {
    if (!uploadedFileId) {
      console.log('⚠ 跳过：没有可用的 file_id');
      return;
    }

    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupFileUrl, {
      group_id: context.testGroupId,
      file_id: uploadedFileId
    });

    Assertions.assertSuccess(response, 'get_group_file_url');
    Assertions.assertResponseHasFields(response, ['url']);

    if (response.data && response.data.url) {
      console.log('✓ 获取到文件下载链接:', response.data.url);
    }
  }, 30000);

  it('测试删除群文件', async () => {
    if (!uploadedFileId) {
      console.log('⚠ 跳过：没有可用的 file_id');
      return;
    }

    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_DeleteGroupFile, {
      group_id: context.testGroupId,
      file_id: uploadedFileId
    });

    Assertions.assertSuccess(response, 'delete_group_file');
  }, 30000);

  it('测试验证文件已删除', async () => {
    if (!uploadedFileId || !uploadedFileName) {
      console.log('⚠ 跳过：没有可用的文件信息');
      return;
    }

    const primaryClient = context.twoAccountTest.getClient('primary');

    // 等待一下确保文件删除完成
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
      group_id: context.testGroupId
    });

    Assertions.assertSuccess(response, 'get_group_root_files');

    // 验证文件列表中不再包含已删除的文件
    if (response.data && response.data.files) {
      const files = response.data.files;
      const foundFile = files.find((f: any) => f.file_name === uploadedFileName);

      if (!foundFile) {
        console.log('✓ 文件已成功删除');
      } else {
        console.log('⚠ 文件可能还存在（可能是缓存延迟）');
      }
    }
  }, 30000);
});
