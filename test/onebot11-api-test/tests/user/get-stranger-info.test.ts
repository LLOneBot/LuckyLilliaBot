/**
 * get_stranger_info 接口测试
 * 测试获取陌生人信息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_stranger_info - 获取陌生人信息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取陌生人信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetStrangerInfo, {
      user_id: context.secondaryUserId
    });

    Assertions.assertSuccess(response, 'get_stranger_info');
    Assertions.assertResponseHasFields(response, ['user_id', 'nickname', 'sex', 'age']);
    Assertions.assertEqual(response.data.user_id, Number(context.secondaryUserId), 'user_id 应该匹配');
  }, 30000);
});
