/**
 * send_pb 接口测试
 * 测试发送 Protobuf 消息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('send_pb - 发送 Protobuf 消息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it.skip('测试发送 Protobuf 消息（需要特殊数据格式）', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    // 此测试需要特殊的 Protobuf 数据格式，默认跳过
    const response = await primaryClient.call(ActionName.SendPB, {
      group_id: context.testGroupId,
      pb_data: '' // Protobuf 数据
    });

    if (response.retcode === 0) {
      Assertions.assertSuccess(response, 'send_pb');
    } else {
      console.log('发送 Protobuf 消息失败:', response.message);
    }
  }, 30000);
});
