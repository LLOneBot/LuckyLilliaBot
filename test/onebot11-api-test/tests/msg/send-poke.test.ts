/**
 * send_poke 接口测试（通用版）
 * 区别于 group_poke / friend_poke：传 group_id 时戳群成员，否则戳好友
 */
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';

describe('send_poke - 戳一戳（通用）', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试群戳一戳', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const response = await primaryClient.call(ActionName.SendPoke, {
      group_id: context.testGroupId,
      user_id: context.secondaryUserId,
    });
    Assertions.assertSuccess(response, 'send_poke (group)');
  }, 30000);

  it('测试好友戳一戳', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const response = await primaryClient.call(ActionName.SendPoke, {
      user_id: context.secondaryUserId,
    });
    Assertions.assertSuccess(response, 'send_poke (friend)');
  }, 30000);
});
