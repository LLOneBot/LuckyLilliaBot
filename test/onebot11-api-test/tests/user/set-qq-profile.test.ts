/**
 * set_qq_profile 接口测试
 * 测试设置 QQ 资料功能
 *
 * 警告：此测试会实际修改 QQ 资料，请谨慎使用
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';

describe('set_qq_profile - 设置 QQ 资料', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  // 这条接口会真把账号昵称/签名改了，且 server 端经常返 UpdateUdcFail 风控；
  // 不进全量回归，本地手动测时把 .skip 去掉
  it.skip('测试设置 QQ 资料 (会修改账号资料)', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_SetQQProfile, {
      nickname: '测试昵称',
      personal_note: '测试签名',
    });

    Assertions.assertSuccess(response, 'set_qq_profile');
  }, 30000);
});
