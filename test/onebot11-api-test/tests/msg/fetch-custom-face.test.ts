/**
 * fetch_custom_face 接口测试
 * 测试获取自定义表情功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('fetch_custom_face - 获取自定义表情', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取自定义表情列表', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.FetchCustomFace, {
      count: 20
    });

    Assertions.assertSuccess(response, 'fetch_custom_face');
    Assertions.assertDefined(response.data, '自定义表情列表应该被定义');
  }, 30000);
});
