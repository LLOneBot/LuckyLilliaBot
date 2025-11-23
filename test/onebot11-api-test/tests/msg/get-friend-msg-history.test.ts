/**
 * get_friend_msg_history 接口测试
 * 测试获取好友消息历史功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llonebot/onebot11/types';

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

    // 先发送一条私聊消息
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

    // 获取消息历史
    const historyResponse = await primaryClient.call(ActionName.GetFriendMsgHistory, {
      user_id: context.secondaryUserId,
      count: 20
    });

    Assertions.assertSuccess(historyResponse, 'get_friend_msg_history');
    Assertions.assertResponseHasFields(historyResponse, ['messages']);
    Assertions.assertDefined(historyResponse.data.messages, '消息历史应该被定义');
  }, 60000);
});
