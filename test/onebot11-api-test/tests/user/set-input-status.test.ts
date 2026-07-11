/**
 * set_input_status 接口测试
 * 设置「对方正在输入...」状态，私聊会话场景。
 * event_type:
 *   1 = 正在输入
 *   2 = 思考中（无明显视觉差别，server 会接受）
 */
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';

describe('set_input_status - 设置输入状态', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试设置正在输入状态', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const response = await primaryClient.call(ActionName.SetInputStatus, {
      user_id: context.secondaryUserId,
      event_type: 1,
    });
    Assertions.assertSuccess(response, 'set_input_status');
  }, 30000);
});
