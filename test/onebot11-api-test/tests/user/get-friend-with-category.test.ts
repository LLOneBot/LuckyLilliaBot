/**
 * get_friend_with_category 接口测试
 * 测试获取分组好友列表功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_friend_with_category - 获取分组好友列表', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取分组好友列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetFriendsWithCategory, {});

    Assertions.assertSuccess(response, 'get_friend_with_category');
    Assertions.assertDefined(response.data, '分组好友列表应该被定义');
  }, 30000);
});
