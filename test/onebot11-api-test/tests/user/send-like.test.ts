/**
 * send_like 接口测试
 * 测试发送点赞功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('send_like - 发送点赞', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试发送点赞', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SendLike, {
      user_id: context.secondaryUserId,
      times: 1
    });
    if (response.retcode !== 0 && !response.message.includes('上限')) {
      throw new Error('点赞测试不通过，' + response.message);
    }
  }, 30000);
});
