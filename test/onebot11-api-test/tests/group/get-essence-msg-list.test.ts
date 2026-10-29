import { setupMessageTest, teardownMessageTest, MessageTestContext } from '../setup';
import { Assertions } from '@/utils/Assertions';
import { ActionName } from '@llbot/plugin/internal/adapter/onebot11/action/types';

describe('get_essence_msg_list', () => {
    let context: MessageTestContext;

    beforeAll(async () => {
        context = await setupMessageTest();
    });

    afterAll(() => {
        teardownMessageTest(context);
    });

    it('should return essence msg list', async () => {
        const primaryClient = context.twoAccountTest.getClient('primary');

        const response = await primaryClient.call(ActionName.GoCQHTTP_GetEssenceMsgList, {
            group_id: context.testGroupId,
        });

        Assertions.assertSuccess(response, 'get_essence_msg_list');
        // The list may be empty
        expect(Array.isArray(response.data)).toBe(true);
    });
});
