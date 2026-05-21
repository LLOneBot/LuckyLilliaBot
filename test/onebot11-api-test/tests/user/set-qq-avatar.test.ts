/**
 * set_qq_avatar 接口测试
 * 测试设置 QQ 头像功能
 *
 * 警告：此测试会实际修改 QQ 头像
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { MediaPaths } from '@/tests/media';

describe('set_qq_avatar - 设置 QQ 头像', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试设置 QQ 头像', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetQQAvatar, {
      file: MediaPaths.testOcrImageUrl,
    });

    Assertions.assertSuccess(response, 'set_qq_avatar');
  }, 30000);
});
