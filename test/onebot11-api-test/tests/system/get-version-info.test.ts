/**
 * get_version_info 接口测试
 * 测试获取版本信息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_version_info - 获取版本信息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取版本信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetVersionInfo, {});

    Assertions.assertSuccess(response, 'get_version_info');
    Assertions.assertResponseHasFields(response, ['app_name', 'app_version', 'protocol_version']);
  }, 30000);
});
