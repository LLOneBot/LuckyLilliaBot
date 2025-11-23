/**
 * get_login_info 接口测试
 * 测试获取登录信息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_login_info - 获取登录信息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取登录信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetLoginInfo, {});

    Assertions.assertSuccess(response, 'get_login_info');
    Assertions.assertResponseHasFields(response, ['user_id', 'nickname']);
    Assertions.assertDefined(response.data.user_id, 'user_id 应该被定义');
    Assertions.assertDefined(response.data.nickname, 'nickname 应该被定义');
  }, 30000);
});
