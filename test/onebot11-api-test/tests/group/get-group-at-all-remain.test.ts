import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_group_at_all_remain', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('should return group at all remain info', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');

    const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupAtAllRemain, {
      group_id: context.testGroupId,
    });

    Assertions.assertSuccess(response, 'get_group_at_all_remain');
    Assertions.assertResponseHasFields(response, [
      'can_at_all',
      'remain_at_all_count_for_group',
      'remain_at_all_count_for_uin',
    ]);
  });
});
