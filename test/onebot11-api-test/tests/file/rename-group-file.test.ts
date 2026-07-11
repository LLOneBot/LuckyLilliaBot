/**
 * rename_group_file 接口测试
 * 改群文件名（区别于改文件夹名 RenameGroupFileFolder）
 */
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { MediaPaths } from '@/tests/media';

describe('rename_group_file - 改群文件名', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试改群文件名', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const ts = Date.now();
    const originalName = `rename-test-${ts}.txt`;
    const newName = `renamed-${ts}.txt`;

    // 1. 先上传文件到根目录
    const upload = await primaryClient.call(ActionName.GoCQHTTP_UploadGroupFile, {
      group_id: context.testGroupId,
      file: MediaPaths.getPath('test_ocr.png'),
      name: originalName,
    });
    Assertions.assertSuccess(upload, 'upload_group_file');
    await new Promise(r => setTimeout(r, 2000));

    // 2. 拿 file_id
    const rootFiles = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
      group_id: context.testGroupId,
    });
    Assertions.assertSuccess(rootFiles, 'get_group_root_files');
    const file = (rootFiles.data?.files ?? []).find((f: any) => f.file_name === originalName);
    if (!file) throw new Error(`找不到刚刚上传的 ${originalName}`);

    // 3. rename
    const response = await primaryClient.call(ActionName.RenameGroupFile, {
      group_id: context.testGroupId,
      file_id: file.file_id,
      current_parent_directory: '/',
      new_name: newName,
    });
    Assertions.assertSuccess(response, 'rename_group_file');

    // 4. cleanup
    await primaryClient.call(ActionName.GoCQHTTP_DeleteGroupFile, {
      group_id: context.testGroupId,
      file_id: file.file_id,
    });
  }, 60000);
});
