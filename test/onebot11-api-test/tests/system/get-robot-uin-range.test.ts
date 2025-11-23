/**
 * get_robot_uin_range 接口测试
 * 测试获取机器人 UIN 范围功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_robot_uin_range - 获取机器人 UIN 范围', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取机器人 UIN 范围', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetRobotUinRange, {});

    Assertions.assertSuccess(response, 'get_robot_uin_range');
    Assertions.assertDefined(response.data, 'UIN 范围应该被定义');
  }, 30000);
});
