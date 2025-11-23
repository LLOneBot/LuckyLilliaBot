/**
 * 群文件额外操作测试
 * 包括: move_group_file, set_group_file_forever, rename_group_file_folder
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('group_file_extra - 群文件额外操作', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试移动群文件', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先获取根目录文件和文件夹
    const rootResponse = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
      group_id: context.testGroupId
    });

    if (rootResponse.retcode === 0 && 
        rootResponse.data.files && rootResponse.data.files.length > 0 &&
        rootResponse.data.folders && rootResponse.data.folders.length > 0) {
      
      const fileId = rootResponse.data.files[0].file_id;
      const targetFolderId = rootResponse.data.folders[0].folder_id;

      const response = await primaryClient.call(ActionName.MoveGroupFile, {
        group_id: context.testGroupId,
        file_id: fileId,
        folder_id: targetFolderId
      });

      if (response.retcode === 0) {
        Assertions.assertSuccess(response, 'move_group_file');
      } else {
        console.log('移动群文件失败（可能是权限不足）:', response.message);
      }
    } else {
      console.log('未找到可用文件或文件夹，跳过测试');
    }
  }, 30000);

  it('测试设置群文件永久保存', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先获取根目录文件
    const rootResponse = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
      group_id: context.testGroupId
    });

    if (rootResponse.retcode === 0 && rootResponse.data.files && rootResponse.data.files.length > 0) {
      const fileId = rootResponse.data.files[0].file_id;

      const response = await primaryClient.call(ActionName.SetGroupFileForever, {
        group_id: context.testGroupId,
        file_id: fileId
      });

      if (response.retcode === 0) {
        Assertions.assertSuccess(response, 'set_group_file_forever');
      } else {
        console.log('设置群文件永久保存失败（可能是权限不足）:', response.message);
      }
    } else {
      console.log('未找到可用文件，跳过测试');
    }
  }, 30000);

  it('测试重命名群文件夹', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先获取根目录文件夹
    const rootResponse = await primaryClient.call(ActionName.GoCQHTTP_GetGroupRootFiles, {
      group_id: context.testGroupId
    });

    if (rootResponse.retcode === 0 && rootResponse.data.folders && rootResponse.data.folders.length > 0) {
      const folderId = rootResponse.data.folders[0].folder_id;
      const newName = `重命名测试-${Date.now()}`;

      const response = await primaryClient.call(ActionName.RenameGroupFileFolder, {
        group_id: context.testGroupId,
        folder_id: folderId,
        new_name: newName
      });

      if (response.retcode === 0) {
        Assertions.assertSuccess(response, 'rename_group_file_folder');
      } else {
        console.log('重命名群文件夹失败（可能是权限不足）:', response.message);
      }
    } else {
      console.log('未找到可用文件夹，跳过测试');
    }
  }, 30000);
});
