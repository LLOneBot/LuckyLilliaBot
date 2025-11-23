/**
 * get_profile_like 接口测试
 * 测试获取点赞列表功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_profile_like - 获取点赞列表', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取点赞列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetProfileLike, {
      start: 0,
      count: 20
    });

    Assertions.assertSuccess(response, 'get_profile_like');
    Assertions.assertResponseHasFields(response, ['users']);
  }, 30000);
});
