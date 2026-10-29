/** 需要管理员权限 */

import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';

describe('set_group_name - 设置群名称', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试设置群名称', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const newName = `TestGroup_${Date.now()}`;

    const setResponse = await primaryClient.call(ActionName.SetGroupName, {
      group_id: context.testGroupId,
      group_name: newName,
    });

    Assertions.assertSuccess(setResponse, 'set_group_name');

    await new Promise(resolve => setTimeout(resolve, 5000));

    const secondaryClient = context.twoAccountTest.getClient('secondary');
    const getResponse = await secondaryClient.call(ActionName.GetGroupInfo, {
      group_id: context.testGroupId,
    });

    Assertions.assertSuccess(getResponse, 'get_group_info');
    Assertions.assertEqual(getResponse.data.group_name, newName, 'Group name should be updated');
  }, 30000);
});
