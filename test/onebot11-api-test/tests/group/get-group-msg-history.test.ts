import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_group_msg_history', () => {
    let context: MessageTestContext;

    beforeAll(async () => {
        context = await setupMessageTest();
    });

    afterAll(() => {
        teardownMessageTest(context);
    });

    it('should get group message history', async () => {
        const primaryClient = context.twoAccountTest.getClient('primary');

        const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupMsgHistory, {
            group_id: context.testGroupId,
            count: 5,
        });

        Assertions.assertSuccess(response, 'get_group_msg_history');
        expect(Array.isArray(response.data.messages)).toBe(true);
    });
});
