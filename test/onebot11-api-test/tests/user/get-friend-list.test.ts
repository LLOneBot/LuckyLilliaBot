/**
 * get_friend_list 接口测试
 * 测试获取好友列表功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_friend_list - 获取好友列表', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取好友列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetFriendList, {});

    Assertions.assertSuccess(response, 'get_friend_list');
    Assertions.assertDefined(response.data, '好友列表应该被定义');
    
    if (Array.isArray(response.data) && response.data.length > 0) {
      const friend = response.data[0];
      Assertions.assertDefined(friend.user_id, '好友 user_id 应该被定义');
      Assertions.assertDefined(friend.nickname, '好友 nickname 应该被定义');
    }
  }, 30000);
});
