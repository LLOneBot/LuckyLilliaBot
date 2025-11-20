/**
 * send_private_msg 接口测试
 * 测试发送私聊消息功能
 *
 * 需求: 6.1
 */

import { OB11MessageEvent } from '@llonebot/onebot11/event';
import {
  OB11MessageText,
  OB11MessageDataType,
  OB11MessageData
} from '@llonebot/onebot11/types';
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { MediaPaths } from '../../media/index.js';

describe('send_private_msg - 发送私聊消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  beforeEach(async () => {
    // 等待一小段时间让之前的消息处理完成
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  it('测试发送私聊文本消息', async () => {
    // 在发送消息前清空队列，避免匹配到旧消息
    context.twoAccountTest.clearAllQueues();

    const primaryClient = context.twoAccountTest.getClient('primary');

    // 测试数组格式
    const testMessage: OB11MessageText[] = [{
        type: OB11MessageDataType.Text,
        data: {
            text: `Test private message ${Date.now()}`
        }
    }];

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: testMessage,
    });
    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    Assertions.assertDefined(sendResponse.data.message_id, 'Message ID should be defined');
    Assertions.assertResponseHasFields(sendResponse, ['message_id']);

    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    }, (event) => {
        const messages = Array.isArray(event.message) ? event.message : [];
        return messages.some((msg: OB11MessageData) =>
            msg.type === OB11MessageDataType.Text &&
            msg.data.text?.includes('Test private message')
        );
    });

    // 测试 CQ 码格式
    const cqMessage = `[CQ:face,id=178,sub_type=1] Test with emoji ${Date.now()}`;
    const cqResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: cqMessage,
    });

    Assertions.assertSuccess(cqResponse, 'send_private_msg');
    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    }, (event) => {
        return event.raw_message?.includes('[CQ:face,id=178');
    });
  }, 60000);

  it('测试发送私聊图片消息', async () => {
    // 在发送消息前清空队列
    context.twoAccountTest.clearAllQueues();

    const primaryClient = context.twoAccountTest.getClient('primary');

    // 测试数组格式
    const testMessage: OB11MessageData[] = [
      {
        type: OB11MessageDataType.Text,
        data: {
          text: `Image test ${Date.now()}`
        }
      },
      {
        type: OB11MessageDataType.Image,
        data: {
          file: MediaPaths.testGifUrl
        }
      }
    ];

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    Assertions.assertDefined(sendResponse.data.message_id, 'Message ID should be defined');

    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    }, (event) => {
        const messages = Array.isArray(event.message) ? event.message : [];
        return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Image);
    }, 150000);

    // 测试 CQ 码格式
    const cqMessage = `[CQ:image,file=${MediaPaths.testGifUrl}] Image via CQ code ${Date.now()}`;
    const cqResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: cqMessage,
    });

    Assertions.assertSuccess(cqResponse, 'send_private_msg');

    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    }, (event) => {
        const messages = Array.isArray(event.message) ? event.message : [];
        return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Image);
    }, 150000);
  }, 60000);

  it('测试发送私聊语音消息', async () => {
    // 在发送消息前清空队列
    context.twoAccountTest.clearAllQueues();

    const primaryClient = context.twoAccountTest.getClient('primary');

    // 测试数组格式
    const testMessage: OB11MessageData[] = [
      {
        type: OB11MessageDataType.Record,
        data: {
          file: MediaPaths.testAudioUrl
        }
      }
    ];

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    Assertions.assertDefined(sendResponse.data.message_id);

    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    }, (event) => {
        const messages = Array.isArray(event.message) ? event.message : [];
        return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Record);
    });

    // 测试 CQ 码格式
    const cqMessage = `[CQ:record,file=${MediaPaths.testAudioUrl}]`;
    const cqResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: cqMessage,
    });

    Assertions.assertSuccess(cqResponse, 'send_private_msg');

    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    }, (event) => {
        const messages = Array.isArray(event.message) ? event.message : [];
        return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Record);
    }, 150000);
  }, 60000);

  it('测试发送私聊视频消息', async () => {
    // 在发送消息前清空队列
    context.twoAccountTest.clearAllQueues();

    const primaryClient = context.twoAccountTest.getClient('primary');

    // 测试数组格式
    const testMessage: OB11MessageData[] = [
      {
        type: OB11MessageDataType.Video,
        data: {
          file: MediaPaths.testVideoUrl
        }
      }
    ];

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    Assertions.assertDefined(sendResponse.data.message_id);

    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    }, (event) => {
        const messages = Array.isArray(event.message) ? event.message : [];
        return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Video);
    }, 150000);

    // 测试 CQ 码格式
    const cqMessage = `[CQ:video,file=${MediaPaths.testVideoUrl}]`;
    const cqResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: cqMessage,
    });

    Assertions.assertSuccess(cqResponse, 'send_private_msg');

    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    }, (event) => {
        const messages = Array.isArray(event.message) ? event.message : [];
        return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Video);
    }, 150000);
  }, 60000);

  it('测试发送回复消息', async () => {
    // 在发送消息前清空队列
    context.twoAccountTest.clearAllQueues();

    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先发送一条消息
    const firstMessage = `Original message ${Date.now()}`;
    const firstResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: firstMessage,
    });

    Assertions.assertSuccess(firstResponse, 'send_private_msg');
    const originalMessageId = firstResponse.data.message_id;

    // 等待消息被接收
    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    });

    // 测试数组格式回复
    const replyMessage: OB11MessageData[] = [
      {
        type: OB11MessageDataType.Reply,
        data: {
          id: String(originalMessageId)
        }
      },
      {
        type: OB11MessageDataType.Text,
        data: {
          text: `Reply test ${Date.now()}`
        }
      }
    ];

    const replyResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: replyMessage,
    });

    Assertions.assertSuccess(replyResponse, 'send_private_msg');
    Assertions.assertDefined(replyResponse.data.message_id);

    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    }, (event) => {
        const messages = Array.isArray(event.message) ? event.message : [];
        return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Reply);
    });

    // 测试 CQ 码格式回复
    const cqReplyMessage = `[CQ:reply,id=${originalMessageId}]Reply via CQ code ${Date.now()}`;
    const cqReplyResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: cqReplyMessage,
    });

    Assertions.assertSuccess(cqReplyResponse, 'send_private_msg');

    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    }, (event) => {
        const messages = Array.isArray(event.message) ? event.message : [];
        return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Reply);
    });
  }, 60000);

  it('测试发送混合消息 (文本 + 图片)', async () => {
    // 在发送消息前清空队列
    context.twoAccountTest.clearAllQueues();

    const testMessage: OB11MessageData[] = [
      {
        type: OB11MessageDataType.Text,
        data: {
          text: ` Mixed message test ${Date.now()} `
        }
      },
      {
        type: OB11MessageDataType.Image,
        data: {
          file: MediaPaths.testGifUrl
        }
      }
    ];
    const primaryClient = context.twoAccountTest.getClient('primary');

    const sendResponse = await primaryClient.call('send_private_msg', {
      user_id: context.secondaryUserId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_private_msg');
    Assertions.assertDefined(sendResponse.data.message_id);

    await context.twoAccountTest.secondaryListener.waitForEvent({
        post_type: 'message',
        message_type: 'private',
        user_id: Number(context.primaryUserId),
    }, (event) => {
        const messages = Array.isArray(event.message) ? event.message : [];
        const hasText = messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Text);
        const hasImage = messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Image);
        return hasText && hasImage;
    }, 150000);
  }, 60000);
});
