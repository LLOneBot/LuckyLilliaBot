/**
 * batch_delete_group_member 接口测试
 * 测试批量踢出群成员功能
 * 
 * 警告：此测试会实际踢出群成员，请谨慎使用
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('batch_delete_group_member - 批量踢出群成员', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试批量踢出群成员 (跳过以避免误操作)', async () => {
    // 此测试会实际踢出群成员，默认跳过
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.BatchDeleteGroupMember, {
      group_id: context.testGroupId,
      user_ids: ['test_user_1', 'test_user_2'] // 替换为实际的测试用户 ID
    });

    Assertions.assertSuccess(response, 'batch_delete_group_member');
  }, 30000);
});
