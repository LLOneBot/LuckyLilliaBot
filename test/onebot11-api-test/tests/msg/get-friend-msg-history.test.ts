import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llbot/onebot11/types';

describe('get_friend_msg_history - 获取好友消息历史', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取好友消息历史', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    const testMessage: OB11MessageData[] = [{
      type: OB11MessageDataType.Text,
      data: {
        text: `Test friend history ${Date.now()}`
      }
    }];

    const sendResponse = await primaryClient.call(ActionName.SendPrivateMsg, {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');

    const historyResponse = await primaryClient.call(ActionName.GetFriendMsgHistory, {
      user_id: context.secondaryUserId,
      count: 20
    });

    Assertions.assertSuccess(historyResponse, 'get_friend_msg_history');
    Assertions.assertResponseHasFields(historyResponse, ['messages']);
    Assertions.assertDefined(historyResponse.data.messages, '消息历史应该被定义');
  }, 60000);
});
