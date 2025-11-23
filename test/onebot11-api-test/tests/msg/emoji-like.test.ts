/**
 * emoji_like 接口测试
 * 测试消息表情回应功能
 * 完整流程：发送消息 → 设置表情回应 → 获取表情回应 → 取消表情回应
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llonebot/onebot11/types';

describe('emoji_like - 消息表情回应', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试完整的表情回应流程', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 步骤1: 发送一条消息
    const testMessage: OB11MessageData[] = [{
      type: OB11MessageDataType.Text,
      data: {
        text: `Test emoji like ${Date.now()}`
      }
    }];

    const sendResponse = await primaryClient.call(ActionName.SendGroupMsg, {
      group_id: context.testGroupId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_group_msg');
    const messageId = sendResponse.data.message_id;
    console.log('✓ 消息发送成功，message_id:', messageId);

    // 步骤2: 设置表情回应
    const emojiId = '4'; // 点赞表情
    const setEmojiResponse = await primaryClient.call(ActionName.SetMsgEmojiLike, {
      message_id: messageId,
      emoji_id: emojiId
    });

    Assertions.assertSuccess(setEmojiResponse, 'set_msg_emoji_like');
    console.log('✓ 表情回应设置成功');

    // 步骤3: 获取表情回应列表
    const fetchResponse = await primaryClient.call(ActionName.FetchEmojiLike, {
      message_id: messageId,
      emoji_id: emojiId,
      count: 20
    });

    Assertions.assertSuccess(fetchResponse, 'emojiLikeList');
    Assertions.assertArrayLength(fetchResponse.data.emojiLikesList, 1);
    console.log('✓ 获取表情回应成功');

    if (fetchResponse.data) {
      console.log('表情回应数据:', fetchResponse.data);
    }

    // 步骤4: 取消表情回应
    const unsetResponse = await primaryClient.call(ActionName.UnSetMsgEmojiLike, {
      message_id: messageId,
      emoji_id: emojiId
    });

    Assertions.assertSuccess(unsetResponse, 'unset_msg_emoji_like');
    console.log('✓ 表情回应取消成功');


    // 步骤5: 再次获取表情回应，验证已取消
    let fetchAfterUnsetResponse = await primaryClient.call(ActionName.FetchEmojiLike, {
      message_id: messageId,
      emoji_id: emojiId,
      count: 20
    });
    Assertions.assertSuccess(fetchAfterUnsetResponse, 'fetch_emoji_like');
    Assertions.assertArrayLength(fetchAfterUnsetResponse.data.emojiLikesList, 0);
    console.log('✓ 验证表情回应已取消');
  }, 120000);
});
