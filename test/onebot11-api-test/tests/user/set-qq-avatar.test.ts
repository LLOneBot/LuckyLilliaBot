/**
 * set_qq_avatar 接口测试
 * 测试设置 QQ 头像功能
 * 
 * 警告：此测试会实际修改 QQ 头像，请谨慎使用
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_qq_avatar - 设置 QQ 头像', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试设置 QQ 头像 (跳过以避免误操作)', async () => {
    // 此测试会实际修改 QQ 头像，默认跳过
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetQQAvatar, {
      file: 'https://example.com/avatar.jpg' // 需要实际的图片 URL
    });

    Assertions.assertSuccess(response, 'set_qq_avatar');
  }, 30000);
});
