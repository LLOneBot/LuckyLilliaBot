/**
 * get_group_album_media_list 接口测试
 * 测试获取群相册中媒体（图片/视频）列表
 */
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';

describe('get_group_album_media_list - 群相册媒体列表', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试取群相册媒体列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先取相册列表，拿一个相册的 album_id
    const albumListResp = await primaryClient.call(ActionName.GetGroupAlbumList, {
      group_id: context.testGroupId,
    });
    Assertions.assertSuccess(albumListResp, 'get_group_album_list');

    const albumList = albumListResp.data?.album_list ?? albumListResp.data?.albumList ?? [];
    if (albumList.length === 0) {
      console.log('测试群没有相册，跳过 media list 测试');
      return;
    }
    const albumId = albumList[0].album_id ?? albumList[0].albumId ?? albumList[0].id;
    if (!albumId) throw new Error('找不到 album_id 字段');

    const response = await primaryClient.call(ActionName.GetGroupAlbumMediaList, {
      group_id: context.testGroupId,
      album_id: albumId,
    });
    Assertions.assertSuccess(response, 'get_group_album_media_list');
  }, 30000);
});
