/** send_forward_msg 用 message_type 区分群聊 / 私聊, 不同于 send_group_forward_msg / send_private_forward_msg */
import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/onebot11/action/types';
import { OB11MessageDataType } from '@llbot/onebot11/types';

describe('send_forward_msg - 通用合并转发', () => {
  let context: MessageTestContext;

  beforeAll(async () => {
    context = await setupMessageTest();
  });

  afterAll(() => {
    teardownMessageTest(context);
  });

  it('测试 message_type=group 发群合并转发', async () => {
    const primaryClient = context.twoAccountTest.getClient('primary');
    const response = await primaryClient.call(ActionName.SendForwardMsg, {
      message_type: 'group',
      group_id: context.testGroupId,
      messages: [
        {
          type: 'node',
          data: {
            user_id: context.primaryUserId,
            nickname: 'tester',
            content: [{ type: OB11MessageDataType.Text, data: { text: 'forward node 1' } }],
          },
        },
        {
          type: 'node',
          data: {
            user_id: context.primaryUserId,
            nickname: 'tester',
            content: [{ type: OB11MessageDataType.Text, data: { text: `forward node 2 ${Date.now()}` } }],
          },
        },
      ],
    });
    Assertions.assertSuccess(response, 'send_forward_msg');
    Assertions.assertResponseHasFields(response, ['message_id']);
  }, 60000);
});
