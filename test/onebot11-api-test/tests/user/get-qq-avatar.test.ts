/**
 * get_qq_avatar 接口测试
 * 测试获取 QQ 头像功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_qq_avatar - 获取 QQ 头像', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取 QQ 头像', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetQQAvatar, {
      user_id: context.secondaryUserId
    });

    Assertions.assertSuccess(response, 'get_qq_avatar');
    Assertions.assertResponseHasFields(response, ['url']);
  }, 30000);
});
