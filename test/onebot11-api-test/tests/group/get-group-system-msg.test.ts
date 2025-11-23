import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_group_system_msg', () => {
    let context: MessageTestContext;

    beforeAll(async () => {
        context = await setupMessageTest();
    });

    afterAll(() => {
        teardownMessageTest(context);
    });

    it('should get group system messages', async () => {
        const primaryClient = context.twoAccountTest.getClient('primary');

        const response = await primaryClient.call(ActionName.GoCQHTTP_GetGroupSystemMsg);

        Assertions.assertSuccess(response, 'get_group_system_msg');
        Assertions.assertResponseHasFields(response, [
            'invited_requests',
            'join_requests',
        ]);
        expect(Array.isArray(response.data.invited_requests)).toBe(true);
        expect(Array.isArray(response.data.join_requests)).toBe(true);
    });
});
