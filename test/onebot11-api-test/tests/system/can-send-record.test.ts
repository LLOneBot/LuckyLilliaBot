/**
 * can_send_record 接口测试
 * 测试检查是否可以发送语音功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('can_send_record - 检查是否可以发送语音', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试检查是否可以发送语音', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.CanSendRecord, {});

    Assertions.assertSuccess(response, 'can_send_record');
    Assertions.assertResponseHasFields(response, ['yes']);
  }, 30000);
});
