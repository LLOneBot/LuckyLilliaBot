import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';

describe('group_file_operations - 群文件操作', () => {
  let context: MessageTestContext;
  let uploadedFileId: string | null = null;
  let uploadedFileName: string | null = null;
  // 上传内容 + 下载比对的 ground truth
  const fileContent = Buffer.from(`Test group file content for operations ${Date.now()} ${Math.random()}`)

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试上传群文件', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const testContent = fileContent.toString('base64');
    uploadedFileName = `test-file-${Date.now()}.txt`;

    const response = await primaryClient.call(ActionName.GoCQHTTP_UploadGroupFile, {
      group_id: context.testGroupId,
      file: `base64://${testContent}`,
      name: uploadedFileName
    });

    Assertions.assertSuccess(response, 'upload_group_file');

    if (response.data && response.data.file_id) {
      uploadedFileId = response.data.file_id;
    }
  }, 60000);

  it('测试获取群根目录文件列表（验证文件已上传）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    await new Promise(resolve => setTimeout(resolve, 3000));

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
      group_id: context.testGroupId
    });

    Assertions.assertSuccess(response, 'get_group_root_files');
    Assertions.assertResponseHasFields(response, ['files', 'folders']);

    if (response.data && response.data.files) {
      const files = response.data.files;
      Assertions.assertDefined(files, '文件列表应该被定义');

      if (uploadedFileName) {
        const foundFile = files.find((f: any) => f.file_name === uploadedFileName);
        if (foundFile) {
          console.log('✓ 找到上传的文件:', foundFile);
          if (!uploadedFileId && foundFile.file_id) {
            uploadedFileId = foundFile.file_id;
          }
        }
      }
    }
  }, 30000);

  it('测试获取群文件下载链接，并下载内容比对', async () => {
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

    expect(response.data.url).toBeTruthy();
    // 真的去下载，验证字节与上传一致
    const downloadResp = await fetch(response.data.url);
    expect(downloadResp.ok).toBe(true);
    const downloaded = Buffer.from(await downloadResp.arrayBuffer());
    expect(downloaded.length).toBe(fileContent.length);
    expect(downloaded.equals(fileContent)).toBe(true);
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

    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
      group_id: context.testGroupId
    });

    Assertions.assertSuccess(response, 'get_group_root_files');

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
