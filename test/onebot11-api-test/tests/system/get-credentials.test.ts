/**
 * get_credentials 接口测试
 * 测试获取凭证信息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_credentials - 获取凭证信息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取凭证信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetCredentials, {
      domain: 'qun.qq.com'
    });

    Assertions.assertSuccess(response, 'get_credentials');
    Assertions.assertResponseHasFields(response, ['cookies', 'csrf_token']);
  }, 30000);
});
