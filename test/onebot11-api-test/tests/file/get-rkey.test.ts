/**
 * get_rkey 接口测试
 * 测试获取文件 Rkey 功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_rkey - 获取图片 Rkey', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取图片 Rkey', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetRKey, {});

    Assertions.assertSuccess(response, 'get_rkey');
    Assertions.assertDefined(response.data, 'Rkey 应该被定义');
  }, 30000);
});
