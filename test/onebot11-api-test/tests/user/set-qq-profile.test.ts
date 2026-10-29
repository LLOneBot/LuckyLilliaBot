import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';

describe('set_qq_profile - 设置 QQ 资料', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  // 会真改账号昵称 / 签名, server 也常返 UpdateUdcFail 风控; 手动测时去掉 .skip
  it.skip('测试设置 QQ 资料 (会修改账号资料)', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_SetQQProfile, {
      nickname: '测试昵称',
      personal_note: '测试签名',
    });

    Assertions.assertSuccess(response, 'set_qq_profile');
  }, 30000);
});
