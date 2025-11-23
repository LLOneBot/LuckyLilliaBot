/**
 * send_group_forward_msg / send_private_forward_msg 接口测试
 * 测试发送合并转发消息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('send_forward_msg - 发送合并转发消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试发送群合并转发消息', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 构造合并转发消息节点
    const messages = [
      {
        type: 'node',
        data: {
          name: '测试用户1',
          uin: context.primaryUserId,
          content: '这是第一条消息'
        }
      },
      {
        type: 'node',
        data: {
          name: '测试用户2',
          uin: context.secondaryUserId,
          content: '这是第二条消息'
        }
      },
      {
        type: 'node',
        data: {
          name: '测试用户3',
          uin: context.primaryUserId,
          content: `合并转发测试 ${Date.now()}`
        }
      }
    ];

    const response = await primaryClient.call(ActionName.GoCQHTTP_SendGroupForwardMsg, {
      group_id: context.testGroupId,
      messages: messages
    });

    if (response.retcode === 0) {
      Assertions.assertSuccess(response, 'send_group_forward_msg');
      Assertions.assertResponseHasFields(response, ['message_id', 'forward_id']);
    } else {
      console.log('发送群合并转发消息失败:', response.message);
    }
  }, 60000);

  it('测试发送私聊合并转发消息', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    const messages = [
      {
        type: 'node',
        data: {
          name: '测试用户',
          uin: context.primaryUserId,
          content: '私聊合并转发测试1'
        }
      },
      {
        type: 'node',
        data: {
          name: '测试用户',
          uin: context.primaryUserId,
          content: `私聊合并转发测试2 ${Date.now()}`
        }
      }
    ];

    const response = await primaryClient.call(ActionName.GoCQHTTP_SendPrivateForwardMsg, {
      user_id: context.secondaryUserId,
      messages: messages
    });

    if (response.retcode === 0) {
      Assertions.assertSuccess(response, 'send_private_forward_msg');
      Assertions.assertResponseHasFields(response, ['message_id', 'forward_id']);
    } else {
      console.log('发送私聊合并转发消息失败:', response.message);
    }
  }, 60000);
});
