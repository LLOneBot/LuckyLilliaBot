/**
 * get_csrf_token 接口测试
 * 测试获取 CSRF Token 功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_csrf_token - 获取 CSRF Token', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取 CSRF Token', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetCsrfToken, {});

    Assertions.assertSuccess(response, 'get_csrf_token');
    Assertions.assertResponseHasFields(response, ['token']);
  }, 30000);
});
