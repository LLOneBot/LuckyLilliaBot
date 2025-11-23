/**
 * get_group_honor_info 接口测试
 * 测试获取群荣誉信息功能
 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_group_honor_info - 获取群荣誉信息', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试获取所有群荣誉信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupHonorInfo, {
      group_id: context.testGroupId,
      type: 'all',
    });

    Assertions.assertSuccess(response, 'get_group_honor_info');
    Assertions.assertDefined(response.data, 'Response data should be defined');
  }, 30000);

  it('测试获取龙王信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupHonorInfo, {
      group_id: context.testGroupId,
      type: 'talkative',
    });

    Assertions.assertSuccess(response, 'get_group_honor_info');
  }, 30000);

  it('测试获取群聊之火信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupHonorInfo, {
      group_id: context.testGroupId,
      type: 'performer',
    });

    Assertions.assertSuccess(response, 'get_group_honor_info');
  }, 30000);

  it('测试获取群聊炽焰信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupHonorInfo, {
      group_id: context.testGroupId,
      type: 'legend',
    });

    Assertions.assertSuccess(response, 'get_group_honor_info');
  }, 30000);

  it('测试获取冒尖小春笋信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupHonorInfo, {
      group_id: context.testGroupId,
      type: 'strong_newbie',
    });

    Assertions.assertSuccess(response, 'get_group_honor_info');
  }, 30000);

  it('测试获取快乐源泉信息', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GetGroupHonorInfo, {
      group_id: context.testGroupId,
      type: 'emotion',
    });

    Assertions.assertSuccess(response, 'get_group_honor_info');
  }, 30000);
});
