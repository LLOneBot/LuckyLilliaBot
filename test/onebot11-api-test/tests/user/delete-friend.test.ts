/**
 * delete_friend 接口测试
 * 测试删除好友功能
 * 
 * 警告：此测试会实际删除好友，请谨慎使用
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('delete_friend - 删除好友', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试删除好友 (跳过以避免误删)', async () => {
    // 此测试会实际删除好友，默认跳过
    // 如需测试，请确保使用测试账号
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_DeleteFriend, {
      user_id: 'test_user_id' // 替换为实际的测试用户 ID
    });

    Assertions.assertSuccess(response, 'delete_friend');
  }, 30000);
});
