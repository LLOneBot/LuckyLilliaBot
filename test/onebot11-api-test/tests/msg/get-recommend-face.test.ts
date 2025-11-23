/**
 * get_recommend_face 接口测试
 * 测试获取推荐表情功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_recommend_face - 获取推荐表情', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取推荐表情', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetRecommendFace, {
      word: '开心'
    });

    Assertions.assertSuccess(response, 'get_recommend_face');
    Assertions.assertResponseHasFields(response, ['url']);
  }, 30000);
});
