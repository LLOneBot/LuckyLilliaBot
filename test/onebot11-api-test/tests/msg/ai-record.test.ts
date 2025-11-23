/**
 * ai_record 接口测试
 * 测试 AI 语音相关功能
 * 完整流程：获取 AI 角色列表 → 发送 AI 语音消息
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llonebot/onebot11/types';

describe('ai_record - AI 语音功能', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取 AI 角色列表并发送 AI 语音', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 步骤1: 获取 AI 角色列表
    const charactersResponse = await primaryClient.call(ActionName.GetAiCharacters, {
      chat_type: 1, // 群聊
      group_id: context.testGroupId
    });

    Assertions.assertSuccess(charactersResponse, 'get_ai_characters');

    // 检查是否有可用的 AI 角色
    if (!charactersResponse.data || charactersResponse.data.length === 0) {
      console.log('⚠ 没有可用的 AI 角色，跳过发送 AI 语音测试');
      return;
    }

    const characters = charactersResponse.data;
    console.log(`✓ 获取到 ${characters.length} 种 AI 角色`);

    // 选择第一个可用的角色
    const firstCharacter = characters[0].characters[0];
    const characterId = firstCharacter.character_id;

    if (!characterId) {
      console.log('⚠ 无法获取角色 ID，跳过发送 AI 语音测试');
      return;
    }

    console.log(`✓ 使用 AI 角色: ${firstCharacter.character_name || firstCharacter.name || characterId}`);

    // 步骤2: 发送 AI 语音消息
    const testText = `测试 AI 语音 ${Date.now()}`;

    const sendResponse = await primaryClient.call(ActionName.SendGroupAiRecord, {
      group_id: context.testGroupId,
      character: characterId,
      text: testText
    });

    Assertions.assertSuccess(sendResponse, 'send_group_ai_record');
    Assertions.assertResponseHasFields(sendResponse, ['message_id']);

    console.log('✓ AI 语音消息发送成功，message_id:', sendResponse.data.message_id);

    // 步骤3: 等待 secondary 接收到 AI 语音消息
    await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'group',
      group_id: Number(context.testGroupId),
      user_id: Number(context.primaryUserId),
    }, (event) => {
      const messages = Array.isArray(event.message) ? event.message : [];
      const hasRecord = messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Record);
      if (hasRecord) {
        console.log('✓ 接收到 AI 语音消息');
      }
      return hasRecord;
    }, 150000);

  }, 180000);
});
