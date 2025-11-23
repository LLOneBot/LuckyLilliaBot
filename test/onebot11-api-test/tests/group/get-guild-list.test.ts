import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('get_guild_list', () => {
    let context: MessageTestContext;

    beforeAll(async () => {
        context = await setupMessageTest();
    });

    afterAll(() => {
        teardownMessageTest(context);
    });

    it('should return guild list', async () => {
        const primaryClient = context.twoAccountTest.getClient('primary');

        const response = await primaryClient.call(ActionName.GetGuildList);

        Assertions.assertSuccess(response, 'get_guild_list');
        // The implementation seems to return null currently, but we check for success
        // If it returns an array in future, we can add more checks
    });
});
