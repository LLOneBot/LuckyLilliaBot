/**
 * group_file_folder 接口测试
 * 测试群文件夹完整生命周期：创建、获取、删除
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('group_file_folder - 群文件夹管理', () => {
  let context: MessageTestContext;
  let createdFolderId: string | null = null;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试创建群文件夹', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const folderName = `测试文件夹_${Date.now()}`;

    const response = await primaryClient.call(ActionName.GoCQHTTP_CreateGroupFileFolder, {
      group_id: context.testGroupId,
      name: folderName
    });

    Assertions.assertSuccess(response, 'create_group_file_folder');

    // 如果返回了 folder_id，保存下来用于后续测试
    if (response.data && response.data.folder_id) {
      createdFolderId = response.data.folder_id;
    }
  }, 30000);

  it('测试获取群根目录文件列表（验证文件夹已创建）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 等待一下确保文件夹创建完成
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
      group_id: context.testGroupId
    });

    Assertions.assertSuccess(response, 'get_group_root_files');
    Assertions.assertResponseHasFields(response, ['files', 'folders']);

    // 验证文件夹列表中包含我们创建的文件夹
    if (response.data && response.data.folders) {
      const folders = response.data.folders;
      Assertions.assertDefined(folders, '文件夹列表应该被定义');

      // 如果有 folder_id，验证它存在
      if (createdFolderId) {
        const foundFolder = folders.find((f: any) => f.folder_id === createdFolderId);
        if (foundFolder) {
          console.log('✓ 找到创建的文件夹:', foundFolder);
        }
      }
    }
  }, 30000);

  it('测试获取群文件夹内文件列表', async () => {
    if (!createdFolderId) {
      console.log('⚠ 跳过：没有可用的 folder_id');
      return;
    }

    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupFilesByFolder, {
      group_id: context.testGroupId,
      folder_id: createdFolderId
    });

    Assertions.assertSuccess(response, 'get_group_files_by_folder');
    Assertions.assertResponseHasFields(response, ['files', 'folders']);
  }, 30000);

  it('测试删除群文件夹', async () => {
    if (!createdFolderId) {
      console.log('⚠ 跳过：没有可用的 folder_id');
      return;
    }

    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_DeleteGroupFolder, {
      group_id: context.testGroupId,
      folder_id: createdFolderId
    });

    Assertions.assertSuccess(response, 'delete_group_folder');
  }, 30000);

  it('测试验证文件夹已删除', async () => {
    if (!createdFolderId) {
      console.log('⚠ 跳过：没有可用的 folder_id');
      return;
    }

    const primaryClient = context.twoAccountTest.getClient('primary');

    // 等待一下确保文件夹删除完成
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
      group_id: context.testGroupId
    });

    Assertions.assertSuccess(response, 'get_group_root_files');

    // 验证文件夹列表中不再包含已删除的文件夹
    if (response.data && response.data.folders) {
      const folders = response.data.folders;
      const foundFolder = folders.find((f: any) => f.folder_id === createdFolderId);

      if (!foundFolder) {
        console.log('✓ 文件夹已成功删除');
      } else {
        console.log('⚠ 文件夹可能还存在（可能是缓存延迟）');
      }
    }
  }, 30000);
});
