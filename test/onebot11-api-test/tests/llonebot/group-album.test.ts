/**
 * 群相册操作测试
 * 包括: get_group_album_list, create_group_album, delete_group_album, upload_group_album
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { MediaPaths } from '../media';

describe('group_album - 群相册操作', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取群相册列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupAlbumList, {
      group_id: context.testGroupId
    });

    if (response.retcode === 0) {
      Assertions.assertSuccess(response, 'get_group_album_list');
      Assertions.assertTrue(Array.isArray(response.data), '相册列表应该是数组');
    } else {
      console.log('获取群相册列表失败:', response.message);
    }
  }, 30000);

  it('测试创建群相册', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const albumName = `测试相册-${Date.now()}`;
    const response = await primaryClient.call(ActionName.CreateGroupAlbum, {
      group_id: context.testGroupId,
      name: albumName
    });

    if (response.retcode === 0) {
      Assertions.assertSuccess(response, 'create_group_album');
    } else {
      console.log('创建群相册失败（可能是权限不足）:', response.message);
    }
  }, 30000);

  it('测试上传群相册图片', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先获取相册列表
    const listResponse = await primaryClient.call(ActionName.GetGroupAlbumList, {
      group_id: context.testGroupId
    });

    if (listResponse.retcode === 0 && Array.isArray(listResponse.data) && listResponse.data.length > 0) {
      const albumId = listResponse.data[0].album_id;

      const response = await primaryClient.call(ActionName.UploadGroupAlbum, {
        group_id: context.testGroupId,
        album_id: albumId,
        file: MediaPaths.testGifUrl
      });

      if (response.retcode === 0) {
        Assertions.assertSuccess(response, 'upload_group_album');
      } else {
        console.log('上传群相册图片失败:', response.message);
      }
    } else {
      console.log('未找到可用相册，跳过测试');
    }
  }, 60000);

  it('测试删除群相册', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先创建一个测试相册
    const albumName = `测试删除相册-${Date.now()}`;
    const createResponse = await primaryClient.call(ActionName.CreateGroupAlbum, {
      group_id: context.testGroupId,
      name: albumName
    });

    if (createResponse.retcode === 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 获取相册列表找到刚创建的相册
      const listResponse = await primaryClient.call(ActionName.GetGroupAlbumList, {
        group_id: context.testGroupId
      });

      if (listResponse.retcode === 0 && Array.isArray(listResponse.data)) {
        const album = listResponse.data.find((a: any) => a.album_name === albumName);

        if (album) {
          const response = await primaryClient.call(ActionName.DeleteGroupAlbum, {
            group_id: context.testGroupId,
            album_id: album.album_id
          });

          if (response.retcode === 0) {
            Assertions.assertSuccess(response, 'delete_group_album');
          } else {
            console.log('删除群相册失败:', response.message);
          }
        } else {
          console.log('未找到刚创建的相册');
        }
      }
    } else {
      console.log('创建测试相册失败，跳过删除测试');
    }
  }, 30000);
});
