import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';

describe('set_friend_add_request - 处理好友请求', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试同意好友请求', async () => {
    // 要有真实的好友请求, 通常得手动触发
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetFriendAddRequest, {
      flag: 'test_flag', // 需要实际的 flag
      approve: true,
      remark: '测试好友'
    });

    Assertions.assertSuccess(response, 'set_friend_add_request');
  }, 30000);

  it.skip('测试拒绝好友请求', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetFriendAddRequest, {
      flag: 'test_flag',
      approve: false
    });

    Assertions.assertSuccess(response, 'set_friend_add_request');
  }, 30000);
});
