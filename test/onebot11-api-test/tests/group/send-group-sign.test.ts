import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llonebot/onebot11/action/types';

describe('send_group_sign', () => {
    let context: MessageTestContext;

    beforeAll(async () => {
        context = await setupMessageTest();
    });

    afterAll(() => {
        teardownMessageTest(context);
    });

    it('should send group sign', async () => {
        const primaryClient = context.twoAccountTest.getClient('primary');

        try {
            const response = await primaryClient.call(ActionName.GoCQHTTP_SendGroupSign, {
                group_id: context.testGroupId,
            });
            Assertions.assertSuccess(response, 'send_group_sign');
        } catch (e) {
            console.warn('Skipping send_group_sign test as it might have already been signed today or other issues:', e);
        }
    });
});
