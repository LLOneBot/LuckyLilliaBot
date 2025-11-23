/**
 * set_group_whole_ban 接口测试
 * 测试群组全员禁言功能
 * 
 * 注意: 需要管理员权限
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_group_whole_ban - 群组全员禁言', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(async () => {
    // 确保测试结束后解除全员禁言
    const primaryClient = context.twoAccountTest.getClient('primary');
    try {
      await primaryClient.call(ActionName.SetGroupWholeBan, {
        group_id: context.testGroupId,
        enable: false,
      });
    } catch (e) {
      // 忽略错误
    }
    teardownMessageTest(context);
  });

  it('测试开启全员禁言', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetGroupWholeBan, {
      group_id: context.testGroupId,
      enable: true,
    });

    Assertions.assertSuccess(response, 'set_group_whole_ban');

    // 等待一段时间让设置生效
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 30000);

  it('测试关闭全员禁言', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.SetGroupWholeBan, {
      group_id: context.testGroupId,
      enable: false,
    });

    Assertions.assertSuccess(response, 'set_group_whole_ban');

    // 等待一段时间让设置生效
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 30000);
});
