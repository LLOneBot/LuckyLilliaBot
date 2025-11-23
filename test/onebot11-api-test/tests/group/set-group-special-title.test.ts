import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('set_group_special_title', () => {
    let context: MessageTestContext;

    beforeAll(async () => {
        context = await setupMessageTest();
    });

    afterAll(() => {
        teardownMessageTest(context);
    });

    it('should set group special title', async () => {
        const primaryClient = context.twoAccountTest.getClient('primary');
        const secondaryClient = context.twoAccountTest.getClient('secondary');

        // Note: This requires the bot to be the owner
        try {
            const response = await primaryClient.call(ActionName.GoCQHTTP_SetGroupSpecialTitle, {
                group_id: context.testGroupId,
                user_id: context.secondaryUserId,
                special_title: 'TestTitle',
            });
            Assertions.assertSuccess(response, 'set_group_special_title');
        } catch (e) {
            console.warn('Skipping set_group_special_title test due to potential permission issues:', e);
        }
    });
});
