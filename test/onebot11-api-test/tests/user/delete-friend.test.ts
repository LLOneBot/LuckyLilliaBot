import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';

describe('delete_friend - 删除好友', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试删除好友 (跳过以避免误删)', async () => {
    // 要测请用测试账号
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_DeleteFriend, {
      user_id: 'test_user_id' // 替换为实际的测试用户 ID
    });

    Assertions.assertSuccess(response, 'delete_friend');
  }, 30000);
});
