/**
 * set_qq_profile 接口测试
 * 测试设置 QQ 资料功能
 *
 * 警告：此测试会实际修改 QQ 资料，请谨慎使用
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_qq_profile - 设置 QQ 资料', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试设置 QQ 资料 (跳过以避免误操作)', async () => {
    // 此测试会实际修改 QQ 资料，默认跳过
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_SetQQProfile, {
      nickname: '测试昵称',
      personal_note: '测试签名',
    });

    Assertions.assertSuccess(response, 'set_qq_profile');
  }, 30000);
});
