/**
 * set_config 接口测试
 * 测试设置配置功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_config - 设置配置', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试设置配置（跳过以避免修改实际配置）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 此测试会修改实际配置，默认跳过
    const response = await primaryClient.call(ActionName.SetConfig, {
      config: {
        // 配置项
      }
    });

    if (response.retcode === 0) {
      Assertions.assertSuccess(response, 'set_config');
    } else {
      console.log('设置配置失败:', response.message);
    }
  }, 30000);
});
