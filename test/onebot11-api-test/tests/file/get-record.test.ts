/**
 * get_record 接口测试
 * 测试获取语音信息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { OB11MessageDataType, OB11MessageData } from '@llbot/onebot11/types';
import { MediaPaths } from '../media';
import { existsSync, statSync, readFileSync } from 'node:fs';

describe('get_record - 获取语音信息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取语音信息', async () => {
    context.twoAccountTest.clearAllQueues();
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 先发送一条语音
    const testMessage: OB11MessageData[] = [
      {
        type: OB11MessageDataType.Record,
        data: {
          file: MediaPaths.testAudioUrl
        }
      }
    ];

    const sendResponse = await primaryClient.call(ActionName.SendGroupMsg, {
      group_id: context.testGroupId,
      message: testMessage,
    });

    Assertions.assertSuccess(sendResponse, 'send_group_msg');

    // 等待消息被接收
    const event = await context.twoAccountTest.secondaryListener.waitForEvent({
      post_type: 'message',
      message_type: 'group',
      message_id: sendResponse.data.message_id,
    }, (event) => {
      const messages = Array.isArray(event.message) ? event.message : [];
      return messages.some((msg: OB11MessageData) => msg.type === OB11MessageDataType.Record);
    }, 150000);

    // 获取语音的 file ID
    const messages = Array.isArray(event.message) ? event.message : [];
    const recordMsg = messages.find((msg: OB11MessageData) => msg.type === OB11MessageDataType.Record);

    if (!recordMsg || !recordMsg.data.file) {
      throw new Error('未找到语音消息');
    }

    // 测试 get_record（默认 mp3 输出）
    const recordResponse = await context.twoAccountTest.getClient('secondary').call(ActionName.GetRecord, {
      file: recordMsg.data.file
    });

    Assertions.assertSuccess(recordResponse, 'get_record');
    Assertions.assertResponseHasFields(recordResponse, ['file', 'file_name', 'file_size']);

    // 真的去看下输出文件：存在、非空、是合法的 mp3（前 3 字节 ID3 或 FF FB 帧头）
    const outPath = recordResponse.data.file;
    expect(existsSync(outPath)).toBe(true);
    const reportedSize = Number(recordResponse.data.file_size);
    const actualSize = statSync(outPath).size;
    expect(actualSize).toBe(reportedSize);
    expect(actualSize).toBeGreaterThan(0);
    const head = readFileSync(outPath).subarray(0, 3);
    const isId3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33; // 'ID3'
    const isMp3Frame = head[0] === 0xFF && (head[1] & 0xE0) === 0xE0;       // MPEG sync 11 bits
    expect(isId3 || isMp3Frame).toBe(true);
  }, 180000);
});

